"""User-facing survey endpoints.

The dispatcher in ``GET /surveys/pending`` is the heart of the survey
trigger semantics. Three independent checks run in priority order:

1. **Pre-study** — if an active ``kind='pre'`` survey exists for the
   user's experiment and the user has no response, return it with
   ``forced=True``. Frontend treats this as a hard gate.
2. **Post-study** — if the user's experiment is ``status='completed'``
   and an active ``kind='post'`` survey exists with no response, return
   it as dismissable.
3. **Inter-session** — if an active ``kind='inter_session'`` survey
   exists, look up the user's most recent prior session (the one before
   the *current* one). If the user has not yet responded for that
   ``about_session_id``, return it dismissable.

Pre wins over post wins over inter-session so the user is never asked to
juggle multiple modals at once.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .deps import get_current_user, get_db
from ...models.experiment import Experiment
from ...models.session import Session as UserSession
from ...models.survey import Survey, SurveyResponse as SurveyResponseModel
from ...models.user import User
from ...schemas.survey import PendingSurvey, SurveySubmit


router = APIRouter(prefix="/surveys", tags=["surveys"])


def _experiment_id_for_user(user: User) -> Optional[UUID]:
    if not user.user_group:
        return None
    return user.user_group.experiment_id


def _has_response(
    db: Session,
    survey_id: UUID,
    user_id: UUID,
    about_session_id: Optional[UUID] = None,
) -> bool:
    q = db.query(SurveyResponseModel).filter(
        SurveyResponseModel.survey_id == survey_id,
        SurveyResponseModel.user_id == user_id,
    )
    if about_session_id is None:
        q = q.filter(SurveyResponseModel.about_session_id.is_(None))
    else:
        q = q.filter(SurveyResponseModel.about_session_id == about_session_id)
    return q.first() is not None


def _previous_session_id(
    db: Session,
    user_id: UUID,
    current_session_id: Optional[UUID],
) -> Optional[UUID]:
    """Return the user's most recent session that is NOT the current one.

    "현재 session"은 클라이언트가 보낸 session_id (없을 수도 있음). 그게 정해지면
    그것보다 이전에 시작한 가장 최근 session 한 개를 inter-session 회고 대상으로 본다.
    None이면 사용자에게 prior session 자체가 없다는 뜻이라 inter-session 트리거 X.
    """
    q = db.query(UserSession).filter(UserSession.user_id == user_id)
    if current_session_id is not None:
        q = q.filter(UserSession.id != current_session_id)
    return q.order_by(desc(UserSession.started_at)).first()


@router.get("/pending", response_model=Optional[PendingSurvey])
def get_pending_survey(
    session_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the next survey the user must / should answer, or null.

    Priority: pre (forced) → post (dismissable) → inter-session
    (dismissable). At most one survey is returned per call so the
    frontend can render a single modal.
    """
    if current_user.is_admin:
        return None

    experiment_id = _experiment_id_for_user(current_user)
    if not experiment_id:
        return None

    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        return None

    # 1. Pre-study (forced)
    pre = (
        db.query(Survey)
        .filter(
            Survey.experiment_id == experiment_id,
            Survey.kind == "pre",
            Survey.is_active.is_(True),
        )
        .first()
    )
    if pre and not _has_response(db, pre.id, current_user.id):
        return PendingSurvey(
            id=pre.id,
            kind="pre",
            name=pre.name,
            questions=pre.questions or [],
            about_session_id=None,
            forced=True,
        )

    # 2. Post-study (dismissable, only after experiment completed)
    if experiment.status == "completed":
        post = (
            db.query(Survey)
            .filter(
                Survey.experiment_id == experiment_id,
                Survey.kind == "post",
                Survey.is_active.is_(True),
            )
            .first()
        )
        if post and not _has_response(db, post.id, current_user.id):
            return PendingSurvey(
                id=post.id,
                kind="post",
                name=post.name,
                questions=post.questions or [],
                about_session_id=None,
                forced=False,
            )

    # 3. Inter-session (dismissable, ask about most recent prior session)
    inter = (
        db.query(Survey)
        .filter(
            Survey.experiment_id == experiment_id,
            Survey.kind == "inter_session",
            Survey.is_active.is_(True),
        )
        .first()
    )
    if inter:
        prior = _previous_session_id(db, current_user.id, session_id)
        if prior is not None and not _has_response(
            db, inter.id, current_user.id, about_session_id=prior.id
        ):
            return PendingSurvey(
                id=inter.id,
                kind="inter_session",
                name=inter.name,
                questions=inter.questions or [],
                about_session_id=prior.id,
                forced=False,
            )

    return None


@router.post("/{survey_id}/respond", status_code=status.HTTP_201_CREATED)
def submit_response(
    survey_id: UUID,
    body: SurveySubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    # Only the experiment's participants may submit.
    user_experiment = _experiment_id_for_user(current_user)
    if user_experiment != survey.experiment_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Survey does not belong to your experiment",
        )

    # Inter-session 응답은 about_session_id 가 반드시 있어야 하고, pre/post 는 절대 없어야 함.
    if survey.kind == "inter_session" and body.about_session_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="inter_session survey requires about_session_id",
        )
    if survey.kind in ("pre", "post") and body.about_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{survey.kind} survey must not carry about_session_id",
        )

    response = SurveyResponseModel(
        survey_id=survey.id,
        user_id=current_user.id,
        about_session_id=body.about_session_id,
        answers=[a.model_dump() for a in body.answers],
    )
    db.add(response)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # Partial unique indexes raise on duplicate submission. Surface
        # 409 so the UI can hide the modal cleanly.
        if "uq_responses_pre_post" in str(e) or "uq_responses_inter_session" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Already responded to this survey",
            )
        raise
    db.refresh(response)
    return {"id": str(response.id)}
