from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, BigInteger, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from ..database import Base


class Event(Base):
    """
    Wide Table + JSONB pattern for flexible event logging.

    Event types:
    - VIDEO_START: User started watching a video
    - VIDEO_END: User stopped watching (includes watch_ratio)
    - LIKE: User liked a video
    - DISLIKE: User disliked a video
    - FEED_CLICK: User clicked a video from feed
    - IMPRESSION: Videos shown to user in feed
    """
    __tablename__ = "events"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="SET NULL"), nullable=True)

    # Event classification
    event_type = Column(String(50), nullable=False)

    # Common structured fields for efficient querying
    watch_ratio = Column(Float, nullable=True)  # For VIDEO_END events
    watch_duration = Column(Float, nullable=True)  # Seconds watched
    position_in_feed = Column(Integer, nullable=True)  # For IMPRESSION, FEED_CLICK
    algorithm = Column(String(50), nullable=True)  # Which recommender was used

    # Flexible payload for additional event-specific data
    payload = Column(JSONB, default=dict)

    # Timestamps
    client_timestamp = Column(DateTime, nullable=False)  # When event occurred on client
    server_timestamp = Column(DateTime, default=datetime.utcnow)  # When server received

    # Relationships
    session = relationship("Session", back_populates="events")
    video = relationship("Video")

    # Indexes for common query patterns
    __table_args__ = (
        Index("idx_events_session_id", "session_id"),
        Index("idx_events_video_id", "video_id"),
        Index("idx_events_event_type", "event_type"),
        Index("idx_events_server_timestamp", "server_timestamp"),
        Index("idx_events_payload", "payload", postgresql_using="gin"),
    )
