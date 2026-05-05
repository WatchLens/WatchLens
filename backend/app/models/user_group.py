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
    # Device class this group's participants are expected to use. The
    # dispatcher renders a mismatch notice for anyone whose viewport
    # falls outside this class. See alembic 021.
    device = Column(String(20), nullable=False, default="desktop")
    algorithm_config = Column(JSONB, nullable=False, default=lambda: {"feed": "random", "watch": "random"})
    # Flat per-surface routing: { feed: <key>, watch: <key> }.
    # Each value is either a built-in preset key (desktop only) or a
    # published `ui_templates.id` whose `device` matches `device` above.
    # See alembic 021.
    ui_config = Column(
        JSONB,
        nullable=False,
        default=lambda: {"feed": "youtube-desktop", "watch": "youtube-desktop"},
    )
    config = Column(JSONB, default=dict)  # Algorithm-specific configuration
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment = relationship("Experiment", back_populates="user_groups")
    users = relationship("User", back_populates="user_group", cascade="all, delete-orphan")
