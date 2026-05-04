"""
Content similarity baseline — TF-IDF cosine on `title + description + tags`.

Watch-only: requires a `current_video_id`. The recommender vectorizes the
experiment's video corpus on each call and returns the top-K most cosine-
similar items to the current video. For modest corpora (a few thousand
videos at most) the per-request fit is cheap; larger pools should pre-
compute and cache the matrix on video upload.

This is the textbook content-based-recommendation baseline (Salton & McGill
1983; Recommender Systems Handbook, Ricci et al. 2022): a deterministic
formula with no hand-tuned weights, no behaviour data dependency, and no
training step. It complements the popularity / recency / random baselines
and contrasts with the learned RecBole policy.
"""
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video


def _video_text(v: Video) -> str:
    """Concatenate the textual signals available on a Video row.

    Uses title + description + space-joined tags. Missing fields are
    treated as the empty string so videos with sparse metadata still
    contribute (rather than getting filtered out at vectorization time)."""
    title = v.title or ""
    description = v.description or ""
    if v.tags:
        tags_text = " ".join(v.tags) if isinstance(v.tags, list) else str(v.tags)
    else:
        tags_text = ""
    return f"{title} {description} {tags_text}".strip()


class SimilarityRecommender(BaseRecommender):
    """TF-IDF cosine content similarity (watch-only)."""

    meta = RecommenderMeta(
        label="Similarity",
        category="baseline",
        description="Content-based similarity using TF-IDF cosine on the "
                    "video's title, description, and tags. Watch-only — "
                    "requires a current video. Cold-start friendly (no "
                    "behaviour data needed).",
    )

    # Watch-only: feed has no `current_video_id`, and a feed-level
    # content baseline doesn't reduce cleanly to a single TF-IDF query.
    supports_feed = False
    supports_watch = True

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
        if current_video_id is None:
            return []

        videos: List[Video] = (
            db.query(Video).filter(Video.experiment_id == experiment_id).all()
        )
        if not videos:
            return []

        # Find the current video's index. If the URL-pinned video isn't
        # part of this experiment's pool, return nothing — we have no
        # vector to compare against.
        try:
            current_idx = next(
                i for i, v in enumerate(videos) if v.id == current_video_id
            )
        except StopIteration:
            return []

        # Lazy import keeps the recommender module importable even on
        # environments where sklearn isn't installed (sklearn is a
        # transitive dep of recbole today, but the pin in
        # requirements.txt makes it explicit).
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity

        corpus = [_video_text(v) for v in videos]
        # If every document is empty, TfidfVectorizer raises. Bail out
        # with no recommendations — caller will fall back upstream.
        if not any(corpus):
            return []

        try:
            tfidf = TfidfVectorizer().fit_transform(corpus)
        except ValueError:
            # Empty vocabulary after stop-word filtering — same handling.
            return []

        sims = cosine_similarity(tfidf[current_idx], tfidf).flatten()

        excluded = set(exclude_video_ids or [])
        ranked = sorted(
            (
                (v, sims[i])
                for i, v in enumerate(videos)
                if v.id != current_video_id and v.id not in excluded
            ),
            key=lambda pair: -pair[1],
        )
        return [v for v, _ in ranked[offset : offset + limit]]
