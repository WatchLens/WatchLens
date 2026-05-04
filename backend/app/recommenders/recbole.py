import logging
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video
from ..models.recommendation_cache import RecommendationCache, ItemSimilarity
from ..services.fallback_stats import get_fallback_stats

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "bpr"


class RecBoleRecommender(BaseRecommender):
    """
    Recommender that serves pre-computed RecBole predictions from PostgreSQL,
    with a multi-stage fallback chain for cold-start and sparse coverage.

    Feed (personalized) fallback chain:
      1. RecBole CF results from recommendation_cache (filtered by model name)
      2. I2I from user history (recent watches -> item_similarity neighbors)
      3. Popularity (view_count DESC)
      4. Recency (created_at DESC)

    Watch (item-to-item) fallback chain:
      1. RecBole I2I from item_similarity (filtered by model name)
      2. Same category videos
      3. Popularity (view_count DESC)

    The watch-side step 1 uses pre-computed similarities written by
    `services/item_similarity_computer.py` (rows tagged `algorithm='auto'`)
    plus any model-specific RecBole I2I rows. This "auto" computation is
    an internal cache, not a user-selectable policy.
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
                db, experiment_id, current_video_id, model_name, limit, offset,
                exclude_video_ids, user_id=user_id, algorithm_params=algorithm_params,
            )
        else:
            return self._get_personalized_with_fallback(
                db, experiment_id, user_id, model_name, limit, offset, exclude_video_ids
            )

    def _extract_model_name(self, algorithm_params: Optional[Dict]) -> str:
        if algorithm_params and "model" in algorithm_params:
            return algorithm_params["model"].lower()
        return DEFAULT_MODEL

    # ── Feed fallback chain ────────────────────────────────────────

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
        """Feed fallback: CF -> I2I(user history) -> popularity -> recency."""
        stats = get_fallback_stats()
        exclude = set(exclude_video_ids) if exclude_video_ids else set()
        results: List[Video] = []

        # Stage 1: RecBole CF from recommendation_cache (paginated)
        cf_videos = self._get_personalized(
            db, experiment_id, user_id, model_name, limit, offset, list(exclude) if exclude else None
        )
        results.extend(cf_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "feed", "cf")
            return results[:limit]

        # Stage 2: I2I from user watch history (non-paginated, first page only)
        # Always compute to know count for offset adjustment
        exclude.update(v.id for v in results)
        i2i_videos = self._i2i_from_user_history(
            db, experiment_id, user_id, limit, list(exclude)
        )
        i2i_count = len(i2i_videos)

        if offset == 0:
            remaining = limit - len(results)
            results.extend(i2i_videos[:remaining])
            if len(results) >= limit:
                stats.record(experiment_id, "feed", "i2i_history")
                return results[:limit]
            exclude.update(v.id for v in i2i_videos)

        # Stage 3: Popularity fallback (paginated)
        # Offset adjustment: account for non-paginated I2I items on page 1
        fallback_offset = max(0, offset - i2i_count)
        remaining = limit - len(results)
        pop_videos = self._get_popularity_fallback(
            db, experiment_id, remaining, fallback_offset, list(exclude)
        )
        results.extend(pop_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "feed", "popularity")
            return results[:limit]

        # Stage 4: Recency fallback (paginated)
        exclude.update(v.id for v in pop_videos)
        remaining = limit - len(results)
        recency_videos = self._get_recency_fallback(
            db, experiment_id, remaining, fallback_offset, list(exclude)
        )
        results.extend(recency_videos)
        stats.record(experiment_id, "feed", "recency")

        return results[:limit]

    # ── Watch fallback chain ───────────────────────────────────────

    def _get_similar_with_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        current_video_id: UUID,
        model_name: str,
        limit: int,
        offset: int,
        exclude_video_ids: Optional[List[UUID]],
        user_id: Optional[UUID] = None,
        algorithm_params: Optional[Dict] = None,
    ) -> List[Video]:
        """Watch fallback: RecBole I2I (+ optional reranking) -> same category -> popularity."""
        stats = get_fallback_stats()
        exclude = set(exclude_video_ids) if exclude_video_ids else set()
        exclude.add(current_video_id)
        results: List[Video] = []

        # Check reranking config
        reranking = None
        if algorithm_params and isinstance(algorithm_params.get("reranking"), dict):
            reranking = algorithm_params["reranking"]

        if reranking and reranking.get("enabled") and user_id:
            # Reranking mode: fetch extra I2I candidates, rerank with U2I scores
            candidates = self._get_similar_items(
                db, experiment_id, current_video_id, model_name, limit * 3, 0, list(exclude)
            )
            if candidates:
                reranked = self._rerank_with_u2i(
                    db, experiment_id, user_id, candidates,
                    reranking["model"].lower(),
                    reranking.get("alpha", 0.3), limit,
                )
                results.extend(reranked)
        else:
            # Standard mode
            sim_videos = self._get_similar_items(
                db, experiment_id, current_video_id, model_name, limit, offset, list(exclude)
            )
            results.extend(sim_videos)

        if len(results) >= limit:
            stats.record(experiment_id, "watch", "i2i")
            return results[:limit]

        # Stage 2: Same category fallback
        exclude.update(v.id for v in results)
        remaining = limit - len(results)
        cat_videos = self._get_same_category_fallback(
            db, experiment_id, current_video_id, remaining, 0, list(exclude)
        )
        results.extend(cat_videos)
        if len(results) >= limit:
            stats.record(experiment_id, "watch", "same_category")
            return results[:limit]

        # Stage 3: Popularity fallback
        exclude.update(v.id for v in cat_videos)
        remaining = limit - len(results)
        pop_videos = self._get_popularity_fallback(
            db, experiment_id, remaining, 0, list(exclude)
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

    def _i2i_from_user_history(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        limit: int,
        exclude_video_ids: List[UUID],
    ) -> List[Video]:
        """
        Feed fallback stage 2: collect I2I neighbors of user's recent watches.

        Gets user's last 10 watched videos, then for each collects up to 5
        similar items from item_similarity (any algorithm: auto or recbole).
        """
        exclude_str = [str(eid) for eid in exclude_video_ids] if exclude_video_ids else []

        # Get user's recent 10 watched videos
        recent_rows = db.execute(
            sa_text("""
                SELECT DISTINCT e.video_id
                FROM events e
                JOIN sessions s ON e.session_id = s.id
                JOIN videos v ON e.video_id = v.id
                WHERE s.user_id = :user_id
                  AND v.experiment_id = :exp_id
                  AND e.event_type IN ('VIDEO_START', 'VIDEO_END')
                  AND e.video_id IS NOT NULL
                ORDER BY e.video_id
                LIMIT 10
            """),
            {"user_id": str(user_id), "exp_id": str(experiment_id)},
        ).fetchall()

        if not recent_rows:
            return []

        recent_video_ids = [row[0] for row in recent_rows]

        # Collect I2I neighbors (any algorithm available)
        candidate_ids: List[UUID] = []
        seen = set(exclude_video_ids) if exclude_video_ids else set()

        for vid in recent_video_ids:
            neighbors = (
                db.query(ItemSimilarity.target_video_id)
                .filter(
                    ItemSimilarity.experiment_id == experiment_id,
                    ItemSimilarity.source_video_id == vid,
                )
                .order_by(ItemSimilarity.score.desc())
                .limit(5)
                .all()
            )
            for (target_id,) in neighbors:
                if target_id not in seen:
                    seen.add(target_id)
                    candidate_ids.append(target_id)
                    if len(candidate_ids) >= limit:
                        break
            if len(candidate_ids) >= limit:
                break

        if not candidate_ids:
            return []

        # Resolve to Video objects preserving order
        videos = (
            db.query(Video)
            .filter(Video.id.in_(candidate_ids[:limit]))
            .all()
        )
        video_map = {v.id: v for v in videos}
        return [video_map[cid] for cid in candidate_ids[:limit] if cid in video_map]

    # ── Reranking ──────────────────────────────────────────────────

    def _rerank_with_u2i(
        self,
        db: Session,
        experiment_id: UUID,
        user_id: UUID,
        i2i_videos: List[Video],
        rerank_model: str,
        alpha: float,
        limit: int,
    ) -> List[Video]:
        """Rerank I2I results using U2I personalization scores via linear interpolation."""
        if not user_id or not i2i_videos:
            return i2i_videos[:limit]

        video_ids = [str(v.id) for v in i2i_videos]

        # Fetch U2I scores from recommendation_cache
        u2i_rows = db.execute(
            sa_text("""
                SELECT video_id, score FROM recommendation_cache
                WHERE experiment_id = :eid AND user_id = :uid AND algorithm = :algo
                AND video_id = ANY(:vids)
            """),
            {
                "eid": str(experiment_id),
                "uid": str(user_id),
                "algo": rerank_model,
                "vids": video_ids,
            },
        ).fetchall()
        u2i_scores = {row[0]: row[1] for row in u2i_rows}

        # I2I scores: rank-based (higher rank = higher score)
        i2i_scores = {v.id: 1.0 - (i / len(i2i_videos)) for i, v in enumerate(i2i_videos)}

        # Min-max normalization
        def norm(scores):
            if not scores:
                return {}
            mn, mx = min(scores.values()), max(scores.values())
            if mx == mn:
                return {k: 0.5 for k in scores}
            return {k: (v - mn) / (mx - mn) for k, v in scores.items()}

        i2i_n = norm(i2i_scores)
        u2i_n = norm(u2i_scores)

        # Linear interpolation: final = (1-alpha) * i2i + alpha * u2i
        final = {}
        for v in i2i_videos:
            i2i_s = i2i_n.get(v.id, 0)
            u2i_s = u2i_n.get(v.id, 0)
            final[v.id] = (1 - alpha) * i2i_s + alpha * u2i_s

        sorted_videos = sorted(i2i_videos, key=lambda v: final.get(v.id, 0), reverse=True)
        return sorted_videos[:limit]

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

    def _get_same_category_fallback(
        self,
        db: Session,
        experiment_id: UUID,
        current_video_id: UUID,
        limit: int,
        offset: int,
        exclude_video_ids: List[UUID],
    ) -> List[Video]:
        current_video = db.query(Video).filter(Video.id == current_video_id).first()
        if not current_video or not current_video.category:
            return []

        query = (
            db.query(Video)
            .filter(
                Video.experiment_id == experiment_id,
                Video.category == current_video.category,
            )
        )
        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))
        return query.order_by(Video.view_count.desc()).offset(offset).limit(limit).all()
