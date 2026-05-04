import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, DateTime, ForeignKey, UniqueConstraint, Index, text
from sqlalchemy.dialects.postgresql import UUID

from ..database import Base


class RecommendationCache(Base):
    """Cached personalized recommendations for Feed page (user -> video scores)."""
    __tablename__ = "recommendation_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)
    algorithm = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('experiment_id', 'user_id', 'video_id', 'algorithm',
                         name='uq_rec_cache_exp_user_video_algo'),
        Index('ix_rec_cache_lookup',
              'experiment_id', 'user_id', 'algorithm', score.desc()),
    )


class ItemSimilarity(Base):
    """Cached item-to-item similarity scores for Watch page (video -> similar videos)."""
    __tablename__ = "item_similarity"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    experiment_id = Column(UUID(as_uuid=True), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    source_video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    target_video_id = Column(UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float, nullable=False)
    algorithm = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('experiment_id', 'source_video_id', 'target_video_id', 'algorithm',
                         name='uq_item_sim_exp_src_tgt_algo'),
        Index('ix_item_sim_lookup',
              'experiment_id', 'source_video_id', 'algorithm', score.desc()),
    )
