"""Survey + SurveyResponse Pydantic schemas.

Two question shapes are accepted:

- ``single`` / ``multi`` — pick from ``answers[]``. ``multi`` honors
  ``minSelect`` / ``maxSelect``; ``maxSelect=0`` means "no upper bound".
  Each answer has ``value: float`` so admins can quantize Likert-style
  scales (1.0 / 0.75 / 0.5 / 0.25) for downstream analysis.
- ``text`` — open-ended response. ``answers`` is empty; the user supplies
  ``textInput`` at response time.

Validators reject obviously malformed shapes (empty answer set on a
single/multi, missing min/max on multi) so admin saves don't silently
brick the survey.
"""
from uuid import UUID
from datetime import datetime
from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


SurveyKind = Literal["pre", "post", "inter_session"]
QuestionType = Literal["single", "multi", "text"]


class QuestionAnswer(BaseModel):
    id: str
    text: str
    value: float = 0.0


class Question(BaseModel):
    id: str
    text: str
    type: QuestionType
    minSelect: Optional[int] = None  # multi only
    maxSelect: Optional[int] = None  # multi only; 0 = no upper bound
    answers: List[QuestionAnswer] = Field(default_factory=list)

    @model_validator(mode="after")
    def _shape(self) -> "Question":
        if self.type == "text":
            if self.answers:
                raise ValueError("text question must not carry an answer list")
            return self
        # single / multi
        if not self.answers:
            raise ValueError(f"{self.type} question requires at least one answer")
        if self.type == "multi":
            if self.minSelect is None or self.maxSelect is None:
                raise ValueError("multi question requires minSelect and maxSelect")
            if self.minSelect < 0:
                raise ValueError("minSelect must be ≥ 0")
            if self.maxSelect != 0 and self.maxSelect < self.minSelect:
                raise ValueError("maxSelect must be ≥ minSelect (or 0 for no upper bound)")
        return self


class SurveyCreate(BaseModel):
    kind: SurveyKind
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = False
    questions: List[Question] = Field(default_factory=list)


class SurveyUpdate(BaseModel):
    kind: Optional[SurveyKind] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    questions: Optional[List[Question]] = None


class SurveyResponse(BaseModel):
    id: UUID
    experiment_id: UUID
    kind: SurveyKind
    name: str
    is_active: bool
    questions: List[Question] = []
    created_at: datetime
    updated_at: datetime
    response_count: int = 0

    class Config:
        from_attributes = True


# ── Submission shapes ──────────────────────────────────────────────


class SelectionItem(BaseModel):
    id: str
    text: str
    value: Optional[float] = None


class AnswerSubmission(BaseModel):
    questionId: str
    questionText: str
    # single/multi 의 선택지 list. text question 이면 비움.
    selections: List[SelectionItem] = Field(default_factory=list)
    # text question 의 자유 응답.
    textInput: Optional[str] = None


class SurveySubmit(BaseModel):
    answers: List[AnswerSubmission]
    # Inter-session 응답에만 채움. pre/post 는 None.
    about_session_id: Optional[UUID] = None


class PendingSurvey(BaseModel):
    """Survey returned to the user when the dispatcher decides one is due."""

    id: UUID
    kind: SurveyKind
    name: str
    questions: List[Question]
    # Inter-session 만 채워짐 — 사용자가 회고할 직전 session.
    about_session_id: Optional[UUID] = None
    # Display 용 forced/dismissable 힌트.
    forced: bool = False  # pre-study 만 true


class SurveyResponseRow(BaseModel):
    id: UUID
    survey_id: UUID
    user_id: UUID
    about_session_id: Optional[UUID] = None
    answers: List[Any] = []
    created_at: datetime

    class Config:
        from_attributes = True
