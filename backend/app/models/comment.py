from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, Text, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database import Base


class Comment(Base):
    """
    Read-only comments imported from external datasets (e.g. YouTube).
    Users cannot create comments; they are displayed for realism in user studies.
    """
    __tablename__ = "comments"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    comment_id = Column(String(200), nullable=False)  # External ID (e.g. YouTube comment ID)
    parent_id = Column(String(200), nullable=True)  # Null for top-level, comment_id of parent for replies
    author_name = Column(String(200), nullable=False)
    author_channel_id = Column(String(200), nullable=True)
    text = Column(Text, nullable=False)
    like_count = Column(Integer, default=0)
    published_at = Column(DateTime, nullable=True)
    reply_count = Column(Integer, default=0)  # Only for top-level comments
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    video = relationship("Video", back_populates="comments")

    __table_args__ = (
        Index("idx_comments_video_id", "video_id"),
        Index("idx_comments_comment_id", "comment_id"),
        Index("idx_comments_parent_id", "parent_id"),
    )
