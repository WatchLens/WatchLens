import logging
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video
from ..models.recommendation_cache import RecommendationCache, ItemSimilarity
from ..services.fallback_stats import get_fallback_stats

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "bpr"


class RecBoleRecommender(BaseRecommender):
    """
    Recommender that serves pre-computed RecBole predictions from PostgreSQL,
    with a thin cold-start fallback chain.

    Feed (personalized) chain:
      1. RecBole CF results from `recommendation_cache` (filtered by model name)
      2. Popularity (view_count DESC)        — cold-start before first training
      3. Recency (created_at DESC)           — cold-start before any view counts

    Watch (item-to-item) chain:
      1. RecBole I2I from `item_similarity` (model-specific, with internal
         fall-through to algorithm='auto' rows written by
         `services/item_similarity_computer.py`)
      2. Popularity (view_count DESC)        — when both model and auto are empty
    """

    meta = RecommenderMeta(
        label="RecBole",
        category="learned",
        description="Learned policy backed by the RecBole framework "
                    "(70+ algorithms — BPR, NeuMF, ItemKNN, …). Trains "
                    "from the events table on a schedule and serves "
                    "from a precomputed cache, with a popularity / "
                    "recency fallback for cold start.",
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
        model_name = self._extract_model_name(algorithm_params)

        if current_video_id:
            return self._get_similar_with_fallback(
                db, experiment_id, current_video_id, model_name, limit, offset, exclude_video_ids,
            )
        return self._get_personalized_with_fallback(
            db, experiment_id, user_id, model_name, limit, offset, exclude_video_ids,
        )

    def _extract_model_name(self, algorithm_params: Optional[Dict]) -> str:
        if algorithm_params and "model" in algorithm_params:
            return algorithm_params["model"].lower()
        return DEFAULT_MODEL

    # ── Feed fallback chain (CF → popularity → recency) ────────────

    def _get_personalized_with_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        model_name: str,
        limit: int,
        offset: int,
        exclude_video_ids: Optional[List[UUID]],
    ) -> List[Video]:
        stats = get_fallback_stats()
        exclude = set(exclude_video_ids) if exclude_video_ids else set()
        results: List[Video] = []

        # Stage 1: RecBole CF from recommendation_cache
        cf_videos = self._get_personalized(
            db, experiment_id, user_id, model_name, limit, offset, list(exclude) if exclude else None,
        )
        results.extend(cf_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "feed", "cf")
            return results[:limit]

        # Stage 2: Popularity fallback
        exclude.update(v.id for v in results)
        remaining = limit - len(results)
        pop_videos = self._get_popularity_fallback(
            db, experiment_id, remaining, offset, list(exclude),
        )
        results.extend(pop_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "feed", "popularity")
            return results[:limit]

        # Stage 3: Recency fallback
        exclude.update(v.id for v in pop_videos)
        remaining = limit - len(results)
        recency_videos = self._get_recency_fallback(
            db, experiment_id, remaining, offset, list(exclude),
        )
        results.extend(recency_videos)
        stats.record(experiment_id, "feed", "recency")

        return results[:limit]

    # ── Watch fallback chain (I2I → popularity) ────────────────────

    def _get_similar_with_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        current_video_id: UUID,
        model_name: str,
        limit: int,
        offset: int,
        exclude_video_ids: Optional[List[UUID]],
    ) -> List[Video]:
        stats = get_fallback_stats()
        exclude = set(exclude_video_ids) if exclude_video_ids else set()
        exclude.add(current_video_id)
        results: List[Video] = []

        # Stage 1: I2I from item_similarity (model_name → auto inner fallback)
        sim_videos = self._get_similar_items(
            db, experiment_id, current_video_id, model_name, limit, offset, list(exclude),
        )
        results.extend(sim_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "watch", "i2i")
            return results[:limit]

        # Stage 2: Popularity fallback
        exclude.update(v.id for v in results)
        remaining = limit - len(results)
        pop_videos = self._get_popularity_fallback(
            db, experiment_id, remaining, 0, list(exclude),
        )
        results.extend(pop_videos)
        stats.record(experiment_id, "watch", "popularity")

        return results[:limit]

    # ── Core queries ───────────────────────────────────────────────

    def _get_personalized(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        model_name: str,
        limit: int,
        offset: int,
        exclude_video_ids: Optional[List[UUID]],
    ) -> List[Video]:
        """Fetch personalized recommendations from recommendation_cache, filtered by algorithm."""
        query = (
            db.query(Video)
            .join(
                RecommendationCache,
                (RecommendationCache.video_id == Video.id)
                & (RecommendationCache.experiment_id == experiment_id)
                & (RecommendationCache.user_id == user_id)
                & (RecommendationCache.algorithm == model_name),
            )
            .filter(Video.experiment_id == experiment_id)
        )

        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))

        return (
            query
            .order_by(RecommendationCache.score.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def _get_similar_items(
        self,
        db: Session,
        experiment_id: UUID,
        current_video_id: UUID,
        model_name: str,
        limit: int,
        offset: int,
        exclude_video_ids: Optional[List[UUID]],
    ) -> List[Video]:
        """Fetch similar items from item_similarity. Tries model-specific first, falls back to 'auto'."""
        query = (
            db.query(Video)
            .join(
                ItemSimilarity,
                (ItemSimilarity.target_video_id == Video.id)
                & (ItemSimilarity.experiment_id == experiment_id)
                & (ItemSimilarity.source_video_id == current_video_id)
                & (ItemSimilarity.algorithm == model_name),
            )
            .filter(Video.experiment_id == experiment_id)
        )

        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))

        results = (
            query
            .order_by(ItemSimilarity.score.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Fall back to 'auto' similarities if model-specific returned nothing
        if not results and model_name != "auto":
            query = (
                db.query(Video)
                .join(
                    ItemSimilarity,
                    (ItemSimilarity.target_video_id == Video.id)
                    & (ItemSimilarity.experiment_id == experiment_id)
                    & (ItemSimilarity.source_video_id == current_video_id)
                    & (ItemSimilarity.algorithm == "auto"),
                )
                .filter(Video.experiment_id == experiment_id)
            )
            if exclude_video_ids:
                query = query.filter(~Video.id.in_(exclude_video_ids))
            results = (
                query
                .order_by(ItemSimilarity.score.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )

        return results

    # ── Fallback helpers ───────────────────────────────────────────

    def _get_popularity_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        limit: int,
        offset: int,
        exclude_video_ids: List[UUID],
    ) -> List[Video]:
        query = db.query(Video).filter(Video.experiment_id == experiment_id)
        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))
        return query.order_by(Video.view_count.desc()).offset(offset).limit(limit).all()

    def _get_recency_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        limit: int,
        offset: int,
        exclude_video_ids: List[UUID],
    ) -> List[Video]:
        query = db.query(Video).filter(Video.experiment_id == experiment_id)
        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))
        return query.order_by(Video.created_at.desc()).offset(offset).limit(limit).all()
