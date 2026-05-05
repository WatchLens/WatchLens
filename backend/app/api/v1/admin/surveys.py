"""Admin endpoints for surveys.

CRUD on ``surveys`` plus a CSV export of responses for analysis. The
``is_active`` flag is the runtime trigger; the partial unique index in
migration 020 enforces "at most one active survey per (experiment, kind)"
so admins can keep drafts alongside the live one without colliding.
"""
import csv
import json
from io import StringIO
from typing import List
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import get_current_admin, get_db
from ....models.experiment import Experiment
from ....models.survey import Survey, SurveyResponse as SurveyResponseModel
from ....models.user import User
from ....schemas.survey import (
    PendingSurvey,
    SurveyCreate,
    SurveyResponse as SurveyOut,
    SurveyUpdate,
)


router = APIRouter(tags=["admin-surveys"])


def _to_response(s: Survey, response_count: int) -> SurveyOut:
    return SurveyOut(
        id=s.id,
        experiment_id=s.experiment_id,
        kind=s.kind,
        name=s.name,
        is_active=s.is_active,
        questions=s.questions or [],
        created_at=s.created_at,
        updated_at=s.updated_at,
        response_count=response_count,
    )


@router.get("/experiments/{experiment_id}/surveys", response_model=List[SurveyOut])
def list_surveys(
    experiment_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    surveys = (
        db.query(Survey)
        .filter(Survey.experiment_id == experiment_id)
        .order_by(Survey.kind.asc(), Survey.created_at.desc())
        .all()
    )
    counts = dict(
        db.query(SurveyResponseModel.survey_id, func.count(SurveyResponseModel.id))
        .filter(SurveyResponseModel.survey_id.in_([s.id for s in surveys]))
        .group_by(SurveyResponseModel.survey_id)
        .all()
    )
    return [_to_response(s, counts.get(s.id, 0)) for s in surveys]


@router.post(
    "/experiments/{experiment_id}/surveys",
    response_model=SurveyOut,
    status_code=status.HTTP_201_CREATED,
)
def create_survey(
    experiment_id: UUID,
    data: SurveyCreate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found")

    survey = Survey(
        experiment_id=experiment_id,
        kind=data.kind,
        name=data.name,
        is_active=data.is_active,
        questions=[q.model_dump() for q in data.questions],
    )
    db.add(survey)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # Hits the partial unique index when admin tries to activate two
        # surveys of the same kind. Surface a 409 so the UI can prompt
        # them to deactivate the existing one first.
        if "uq_surveys_one_active_per_kind" in str(e.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another active {data.kind} survey already exists for this experiment.",
            )
        raise
    db.refresh(survey)
    return _to_response(survey, 0)


@router.patch("/surveys/{survey_id}", response_model=SurveyOut)
def update_survey(
    survey_id: UUID,
    data: SurveyUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    if data.kind is not None:
        survey.kind = data.kind
    if data.name is not None:
        survey.name = data.name
    if data.is_active is not None:
        survey.is_active = data.is_active
    if data.questions is not None:
        survey.questions = [q.model_dump() for q in data.questions]

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "uq_surveys_one_active_per_kind" in str(e.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Another active {survey.kind} survey already exists for this experiment.",
            )
        raise
    db.refresh(survey)
    response_count = (
        db.query(func.count(SurveyResponseModel.id))
        .filter(SurveyResponseModel.survey_id == survey.id)
        .scalar()
    ) or 0
    return _to_response(survey, response_count)


@router.delete("/surveys/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_survey(
    survey_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")
    db.delete(survey)
    db.commit()


@router.get("/surveys/{survey_id}/responses/csv")
def export_responses_csv(
    survey_id: UUID,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Stream survey responses as CSV. One row per (response, question)."""
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found")

    rows = (
        db.query(SurveyResponseModel, User.login_id)
        .join(User, User.id == SurveyResponseModel.user_id)
        .filter(SurveyResponseModel.survey_id == survey_id)
        .order_by(SurveyResponseModel.created_at.asc())
        .all()
    )

    def _row_bytes(values: list) -> bytes:
        buf = StringIO()
        csv.writer(buf).writerow(values)
        return buf.getvalue().encode("utf-8")

    def generate():
        # BOM for Excel-friendly UTF-8 (matches events CSV export pattern).
        yield b"\xef\xbb\xbf"
        yield _row_bytes([
            "response_id",
            "user_login_id",
            "about_session_id",
            "created_at",
            "question_id",
            "question_text",
            "selections",
            "text_input",
        ])
        for response, login_id in rows:
            for ans in response.answers or []:
                selections = json.dumps(ans.get("selections") or [], ensure_ascii=False)
                yield _row_bytes([
                    str(response.id),
                    login_id,
                    str(response.about_session_id) if response.about_session_id else "",
                    response.created_at.isoformat() if response.created_at else "",
                    ans.get("questionId", ""),
                    ans.get("questionText", ""),
                    selections,
                    ans.get("textInput") or "",
                ])

    return StreamingResponse(
        generate(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f'survey_{survey.name}.csv', safe='')}"
        },
    )
