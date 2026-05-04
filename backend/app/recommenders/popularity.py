from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video


class PopularityRecommender(BaseRecommender):
    """Sort by `view_count desc`. Non-personalized popularity baseline."""

    meta = RecommenderMeta(
        label="Popularity",
        category="baseline",
        description="Returns videos sorted by view count (most popular first). "
                    "Non-personalized baseline that captures the popularity bias "
                    "common in real platforms.",
    )

    def get_recommendations(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
        exclude_video_ids: Optional[List[UUID]] = None,
        current_video_id: Optional[UUID] = None,
        algorithm_params: Optional[Dict] = None,
    ) -> List[Video]:
        query = db.query(Video).filter(Video.experiment_id == experiment_id)
        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))
        return query.order_by(Video.view_count.desc()).offset(offset).limit(limit).all()
