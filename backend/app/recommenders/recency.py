from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video


class RecencyRecommender(BaseRecommender):
    """Sort by `created_at desc` — newest content first. The recency
    baseline used in news / video recommendation literature."""

    meta = RecommenderMeta(
        label="Recency",
        category="baseline",
        description="Returns videos sorted by creation date (newest first). "
                    "Captures the recency bias present in many platforms; "
                    "useful as a temporal baseline.",
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
        return query.order_by(Video.created_at.desc()).offset(offset).limit(limit).all()
