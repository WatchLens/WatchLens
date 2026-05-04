from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video


class RandomRecommender(BaseRecommender):
    """Random ordering. Control / baseline for A/B comparisons."""

    meta = RecommenderMeta(
        label="Random",
        category="baseline",
        description="Returns videos in random order. Use as a control / "
                    "baseline policy for A/B experiments.",
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
        return query.order_by(func.random()).offset(offset).limit(limit).all()
