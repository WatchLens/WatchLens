import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class Video(Base):
    __tablename__ = "videos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(String(100), nullable=False, index=True)  # External ID from CSV
    title = Column(String(1000), nullable=True)
    url = Column(String(1000), nullable=False)  # MP4 URL or YouTube video ID
    thumbnail_url = Column(String(1000), nullable=True)
    video_type = Column(String(20), default="url")  # url, youtube
    duration = Column(Integer, nullable=True)  # Duration in seconds
    category = Column(String(100), nullable=True)
    tags = Column(JSONB, default=list)
    extra_metadata = Column("metadata", JSONB, default=dict)
    view_count = Column(Integer, default=0)  # For popularity algorithm
    # YouTube-style metadata fields
    description = Column(String(5000), nullable=True)
    like_count = Column(Integer, default=0)
    dislike_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    channel_name = Column(String(200), nullable=True)
    channel_id = Column(String(200), nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    experiment = relationship("Experiment", back_populates="videos")
    comments = relationship("Comment", back_populates="video", cascade="all, delete-orphan")

