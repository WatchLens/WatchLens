"""Survey + SurveyResponse models.

A ``Survey`` belongs to an experiment and has a discriminator (``kind``)
that decides when the user sees it:

- ``pre`` — forced gating before the feed (user cannot enter ``/`` without
  responding while the survey is active).
- ``post`` — shown after the experiment is marked ``completed`` and the
  survey is active. Dismissable from the user side.
- ``inter_session`` — shown on a new SESSION_START if the user has any
  prior session that has not yet been responded to. One response per
  ``about_session_id``.

The ``questions`` JSONB shape is enforced by the Pydantic schema (see
``schemas/survey.py``); the DB stays permissive.

``SurveyResponse.about_session_id`` is ``NULL`` for pre / post and the
prior session's id for inter-session. Two partial unique indexes
(migration 020) prevent duplicate submissions in either case.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class Survey(Base):
    __tablename__ = "surveys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("experiments.id", ondelete="CASCADE"),
        nullable=False,
    )
    # 'pre' | 'post' | 'inter_session'
    kind = Column(String(20), nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=False)
    # JSONB shape (enforced by schemas):
    # [{
    #     "id": str,
    #     "text": str,
    #     "type": "single" | "multi" | "text",
    #     "minSelect": int | None,        # multi only
    #     "maxSelect": int | None,        # multi only; 0 = no upper bound
    #     "answers": [{"id": str, "text": str, "value": float}]   # single/multi only
    # }]
    questions = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    responses = relationship(
        "SurveyResponse",
        back_populates="survey",
        cascade="all, delete-orphan",
    )


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id = Column(
        UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Inter-session 응답만 set. pre/post 는 NULL.
    about_session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    # JSONB: [{"questionId": str, "questionText": str,
    #          "selections": [{"id": str, "text": str, "value": float | None}],
    #          "textInput": str | None}]
    # questionText snapshot 보관해서 admin이 question text 바꿔도 옛 응답이 원래 문구로 재현 가능.
    answers = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    survey = relationship("Survey", back_populates="responses")
