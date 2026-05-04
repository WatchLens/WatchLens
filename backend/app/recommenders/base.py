"""
Recommender plug-in interface.

Every recommendation policy implements `BaseRecommender` and registers an
instance in `RECOMMENDERS` (see `__init__.py`). The dispatcher in
`api/v1/feed.py` looks up the policy by the key the user's group sets in
`algorithm_config.feed` / `.watch` and invokes `get_recommendations`.

To add a new policy:
1. Subclass `BaseRecommender`. Set `meta` and the `supports_*` flags.
2. Implement `get_recommendations`.
3. Register the instance under a unique key in `RECOMMENDERS`.

The validator in `schemas/user_group.py` accepts any key registered in
`RECOMMENDERS`, so steps 1–3 are the entire path — no Pydantic / TS
Literal updates needed.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from ..models.video import Video


@dataclass(frozen=True)
class RecommenderMeta:
    """Human-readable description of a recommender, surfaced by the
    `GET /admin/recommenders` endpoint and rendered in the admin UI's
    algorithm dropdown."""
    label: str
    category: str  # 'baseline' | 'learned' | 'external'
    description: str


class BaseRecommender(ABC):
    """Abstract base class for all recommenders."""

    # Override these in subclasses.
    meta: RecommenderMeta = RecommenderMeta(
        label="Unnamed",
        category="baseline",
        description="(no description)",
    )
    supports_feed: bool = True
    supports_watch: bool = True

    @abstractmethod
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
        """Return recommended videos for a user.

        Args:
            db: Database session.
            experiment_id: The experiment to draw videos from.
            user_id: The user requesting recommendations.
            limit: Maximum number of videos to return.
            offset: Pagination offset.
            exclude_video_ids: Video IDs to exclude (typically watched history).
            current_video_id: Current video on the watch page; `None` for the feed.
            algorithm_params: Optional per-group config (e.g. `{"model": "BPR"}`).
        """
        pass

    @property
    def name(self) -> str:
        """Human-readable name. Defaults to the class name with the
        `Recommender` suffix stripped."""
        return self.__class__.__name__.replace("Recommender", "")
