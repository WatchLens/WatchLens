import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class UserGroup(Base):
    __tablename__ = "user_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    algorithm_config = Column(JSONB, nullable=False, default=lambda: {"feed": "random", "watch": "random"})
    ui_config = Column(JSONB, nullable=False, default=lambda: {"feed": "youtube", "watch": "youtube"})
    config = Column(JSONB, default=dict)  # Algorithm-specific configuration
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment = relationship("Experiment", back_populates="user_groups")
    users = relationship("User", back_populates="user_group", cascade="all, delete-orphan")
