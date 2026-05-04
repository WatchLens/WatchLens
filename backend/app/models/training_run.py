import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    model_name = Column(String(50), nullable=False)
    top_k = Column(Integer, nullable=False, default=100)
    hyperparameters = Column(JSONB, default=dict)
    status = Column(String(20), nullable=False, default="pending")
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    metrics = Column(JSONB, nullable=True)
    interaction_count = Column(Integer, nullable=True)
    user_count = Column(Integer, nullable=True)
    item_count = Column(Integer, nullable=True)
    recommendation_count = Column(Integer, nullable=True)
    similarity_count = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    triggered_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    experiment = relationship("Experiment")
    triggered_by_user = relationship("User", foreign_keys=[triggered_by])
