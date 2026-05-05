# Adding a recommendation policy (Python plug-in)

WatchLens serves recommendations through a **plug-in** interface: every
policy implements `BaseRecommender` (one method, one DB session) and
registers a single instance under a unique key. The dispatcher in
`backend/app/api/v1/feed.py` looks up the policy by the key the user's
group sets in `algorithm_config.feed` / `.watch` and invokes
`get_recommendations`.

This guide covers the **in-process Python track** — the path researchers
take when they want to write the algorithm in Python and run it inside
the platform. For non-Python and externally hosted models, see
[`adding-an-external-recommender.md`](./adding-an-external-recommender.md)
(the HTTP track).

If you just want to know what the existing built-in policies do, see
the [Built-in recommenders](#built-in-recommenders) section at the end.

---

## TL;DR — the entire workflow

1. Create `backend/app/recommenders/<your_name>.py`.
2. Subclass `BaseRecommender`, set `meta` and the capability flags,
   implement `get_recommendations`.
3. Register the instance in `RECOMMENDERS` (one line in
   `backend/app/recommenders/__init__.py`).
4. Restart the backend.

That's it. No frontend rebuild. No Pydantic / TypeScript Literal
updates. The admin UI's algorithm dropdown auto-discovers the new
policy on the next page load.

---

## Quick start — a worked example

Goal: a personalized baseline that recommends videos from the user's
most-watched category.

### Step 1 — `backend/app/recommenders/category_match.py`

```python
from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import func

from .base import BaseRecommender, RecommenderMeta
from ..models.video import Video
from ..models.event import Event


class CategoryMatchRecommender(BaseRecommender):
    """Recommends videos in the user's most-watched category."""

    meta = RecommenderMeta(
        label="Category Match",
        category="baseline",
        description="Returns videos from the user's most-watched category. "
                    "Simple personalized baseline using only category metadata.",
    )

    # Defaults are True for both — flip these to False to constrain the
    # surface where this policy is allowed (the validator + admin UI
    # honor the flags automatically).
    supports_feed = True
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
        # 1. Find the user's most-watched category.
        top = (
            db.query(Video.category, func.count(Event.id).label("n"))
            .join(Event, Event.video_id == Video.id)
            .filter(
                Event.user_id == user_id,
                Event.event_type == "VIDEO_WATCHED_1S",
                Video.experiment_id == experiment_id,
            )
            .group_by(Video.category)
            .order_by(func.count(Event.id).desc())
            .first()
        )

        # 2. Pull videos in that category, sorted by view count.
        query = db.query(Video).filter(Video.experiment_id == experiment_id)
        if top is not None:
            query = query.filter(Video.category == top[0])
        if exclude_video_ids:
            query = query.filter(~Video.id.in_(exclude_video_ids))
        return query.order_by(Video.view_count.desc()).offset(offset).limit(limit).all()
```

### Step 2 — register in `backend/app/recommenders/__init__.py`

```python
from .category_match import CategoryMatchRecommender   # ← add

RECOMMENDERS = {
    "random": RandomRecommender(),
    "popularity": PopularityRecommender(),
    "recency": RecencyRecommender(),
    "similarity": SimilarityRecommender(),
    "recbole": RecBoleRecommender(),
    "category_match": CategoryMatchRecommender(),       # ← add
}
```

### Step 3 — `docker compose restart backend`

Done. Visit the experiment's group page, click **Edit algorithm**, and
your new policy appears in the dropdown. The validator will accept
`algorithm_config.feed = "category_match"` for new groups; existing
groups using deprecated keys are unaffected.

---

## The `BaseRecommender` contract

```python
class BaseRecommender(ABC):
    meta: RecommenderMeta = RecommenderMeta(label="...", category="...", description="...")
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
        ...
```

**One method.** The dispatcher does everything else — auth, group
lookup, watched-history extraction, error mapping. Your job is to
return a `List[Video]`.

### `RecommenderMeta`

```python
@dataclass(frozen=True)
class RecommenderMeta:
    label: str          # Human-readable name shown in the admin dropdown.
    category: str       # 'baseline' | 'learned' | 'external' (free-form).
    description: str    # Long-form description shown as a tooltip.
```

### Capability flags

| Flag | Meaning |
|------|---------|
| `supports_feed = True` | Allowed as `algorithm_config.feed`. |
| `supports_watch = True` | Allowed as `algorithm_config.watch`. |

The schema validator rejects misconfigurations at admin time; the
admin UI's dropdown shows only compatible policies for each surface.
Set `supports_feed = False` if your algorithm requires
`current_video_id` (a feed page won't have one).

---

## Method parameters

| Parameter | Type | What it is |
|-----------|------|-----------|
| `db` | `sqlalchemy.orm.Session` | Synchronous DB session. Read freely. Write side-effects belong in services (see [Pre-computation](#pre-computation--heavy-ml-models)). |
| `experiment_id` | `UUID` | The experiment whose video pool you should draw from. **Always filter by this** — videos from another experiment are not in scope. |
| `user_id` | `UUID` | The current user. Use to look up their behaviour from the events table. |
| `limit` | `int` | Maximum items to return. The dispatcher passes `limit + 1` so it can detect "has more"; treat the value you receive as the actual cap. |
| `offset` | `int` | Pagination offset. Calculated by the dispatcher as `(page - 1) * limit`. |
| `exclude_video_ids` | `Optional[List[UUID]]` | Video IDs the user already saw. Computed by the dispatcher (currently videos with `VIDEO_WATCHED_1S` ≥ 1s OR `VIDEO_ENDED`). Just filter these out of your candidate set. |
| `current_video_id` | `Optional[UUID]` | The current video on the watch page. `None` for feed requests. Use this as the anchor for item-to-item recommendations. |
| `algorithm_params` | `Optional[Dict]` | Per-group config (see [Group config](#per-group-configuration)). Free-form JSONB. |

### Return value

`List[Video]` — Video model instances (already `experiment_id`-scoped).
Order is preserved as returned. Empty list is fine for cold-start; the
dispatcher will surface an empty feed.

---

## Data access — what's in your toolbox

### Database tables (read freely)

Import the model and use `db.query(Model)`:

| Table | Model | Key fields |
|-------|-------|-----------|
| `videos` | `Video` (`models/video.py`) | `id`, `experiment_id`, `title`, `description`, `tags` (JSONB array), `category`, `channel_name`, `channel_id`, `view_count`, `like_count`, `dislike_count`, `duration`, `published_at`, `created_at`, `thumbnail_url`, `url`, `resolved_url` (JSONB) |
| `events` | `Event` (`models/event.py`) | `id`, `user_id`, `video_id`, `event_type` (33 values), `payload` (JSONB), `watch_ratio`, `watch_duration`, `position_in_feed`, `algorithm`, `created_at` |
| `users` | `User` (`models/user.py`) | `id`, `login_id`, `user_group_id`, `ui_config` |
| `user_groups` | `UserGroup` (`models/user_group.py`) | `id`, `experiment_id`, `name`, `algorithm_config` (JSONB), `ui_config` (JSONB), `config` (JSONB) |
| `experiments` | `Experiment` (`models/experiment.py`) | `id`, `name`, `status`, `start_date`, `end_date` |
| `comments` | `Comment` (`models/comment.py`) | per-video discussion |
| `recommendation_cache` | `RecommendationCache` (`models/recommendation_cache.py`) | Pre-computed U2I results: `user_id`, `video_id`, `score`, `algorithm`, `model_name` |
| `item_similarity` | `ItemSimilarity` (same file) | Pre-computed I2I scores: `source_video_id`, `target_video_id`, `score`, `algorithm` |
| `sessions` | `Session` (`models/session.py`) | session_id ↔ user_id mapping (events join on this) |

Raw SQL is fine when ORM is awkward:

```python
from sqlalchemy import text as sa_text

db.execute(sa_text("""
    SELECT video_id, COUNT(*) AS clicks
    FROM events
    WHERE user_id = :uid AND event_type = 'FEED_CLICK'
    GROUP BY video_id
"""), {"uid": str(user_id)})
```

### Event types — the behaviour signal menu

`Event.event_type` holds 33 distinct values; the most useful for
recommenders fall into these groups:

| Group | Events | Typical use |
|-------|--------|-------------|
| **Implicit positive** | `VIDEO_WATCHED_1S`, `VIDEO_ENDED` | "User actually watched this" — primary positive signal. `watch_ratio` (promoted column) tells you completion fraction. |
| **Explicit feedback** | `LIKE`, `DISLIKE` | Strong preference signal. Sparser. |
| **Engagement** | `FEED_CLICK`, `VIDEO_CLICK`, `THUMBNAIL_HOVER` | Click / hover intent. |
| **Continuous playback** | `VIDEO_PROGRESS` (every 5 s), `VIDEO_PAUSE`, `VIDEO_SEEK` | Partial watch / engagement depth. |
| **Impressions** | `IMPRESSION` | Denominator for CTR. The card was ≥ 50% visible. |
| **Session** | `SESSION_START`, `SESSION_END`, `PAGE_LOAD`, `PAGE_EXIT`, `NAVIGATION` | Session timing / dwell-time analysis. |

Full list with payload contracts: [`docs/event-schema.md`](./event-schema.md).

### Reusing other recommenders' caches

`RecommendationCache` (RecBole U2I) and `ItemSimilarity` (RecBole I2I
+ metadata-based `algorithm='auto'` rows) are open for any policy to
read. A common pattern: your algorithm's primary path returns nothing
on cold start, so fall back to RecBole's pre-computed scores or to the
`auto` similarity neighbors:

```python
from ..models.recommendation_cache import RecommendationCache, ItemSimilarity

# RecBole U2I cache
top = (db.query(RecommendationCache)
       .filter_by(user_id=user_id, algorithm='recbole', model_name='bpr')
       .order_by(RecommendationCache.score.desc())
       .limit(limit).all())

# 'auto' I2I similarity (computed by services/item_similarity_computer.py)
sims = (db.query(ItemSimilarity)
        .filter_by(source_video_id=current_video_id, algorithm='auto')
        .order_by(ItemSimilarity.score.desc()).limit(20).all())
```

### Available libraries

| Lib | Notes |
|-----|-------|
| `sklearn` | Pinned in `requirements.txt`. TF-IDF, cosine, KMeans, NearestNeighbors, etc. The `similarity` baseline uses it. |
| `numpy`, `scipy` | Transitive deps of sklearn / RecBole. Available. |
| `pandas` | Transitive. Use for non-trivial groupbys / pivot tables. |
| `RecBole` + `torch` | Heavyweight. Already used by `RecBoleRecommender`. Import only if you need actual ML. |
| `logging` | `logger = logging.getLogger(__name__)` — emit `info` / `warning` for observability. |

To add a new dependency, edit `backend/requirements.txt` and rebuild
the backend image.

---

## Per-group configuration (`algorithm_params`)

A single recommender can be parameterised per user group via the
group's `config` JSONB. The dispatcher pulls the relevant slice and
hands it to your `get_recommendations`:

```python
# UserGroup.config example:
# {
#   "category_match": {"min_overlap": 3, "fallback": "popularity"}
# }

def get_recommendations(self, ..., algorithm_params=None):
    params = algorithm_params or {}
    min_overlap = params.get("min_overlap", 1)
    fallback = params.get("fallback", "popularity")
    ...
```

Why: the same policy can run as two arms of an A/B test with different
hyperparameters. The platform's RecBole recommender already uses this
pattern — `config.recbole_feed.model = "BPR"` vs `"NeuMF"` selects
different trained models without registering a separate policy.

The dispatcher convention for the lookup key in `config` is the
algorithm key itself (so `category_match.config.category_match = {...}`),
or for RecBole specifically `config.recbole_feed` / `config.recbole_watch`.
Add your own convention in your `get_recommendations` body.

---

## Recipes

### 1. Content-based — TF-IDF cosine on metadata

See `backend/app/recommenders/similarity.py`. Vectorize
`title + description + tags` with sklearn `TfidfVectorizer`, take cosine
similarity to `current_video_id`, return top-K. Watch-only.

### 2. Collaborative — co-watch overlap

```python
def get_recommendations(self, db, ..., current_video_id, ...):
    if not current_video_id:
        return []
    cohort = (db.query(Event.user_id)
              .filter(Event.video_id == current_video_id,
                      Event.event_type.in_(['VIDEO_WATCHED_1S', 'VIDEO_ENDED']))
              .distinct().subquery())
    return (db.query(Video, func.count(Event.user_id).label('overlap'))
            .join(Event, Event.video_id == Video.id)
            .filter(Event.user_id.in_(cohort),
                    Video.id != current_video_id,
                    Video.experiment_id == experiment_id)
            .group_by(Video.id)
            .order_by(func.count(Event.user_id).desc())
            .offset(offset).limit(limit).all())
```

### 3. Hybrid — RecBole + popularity reranking

Pull RecBole's pre-computed scores, blend with current view counts:

```python
def get_recommendations(self, db, ..., user_id, ...):
    rec = (db.query(RecommendationCache.video_id, RecommendationCache.score)
           .filter_by(user_id=user_id, algorithm='recbole', model_name='bpr')
           .order_by(RecommendationCache.score.desc())
           .limit(100).all())
    if not rec:
        # cold start: fall back to popularity
        return (db.query(Video).filter_by(experiment_id=experiment_id)
                .order_by(Video.view_count.desc()).limit(limit).all())
    # blend RecBole score with normalized popularity
    video_ids = [r.video_id for r in rec]
    videos = {v.id: v for v in db.query(Video).filter(Video.id.in_(video_ids)).all()}
    rec_score = {r.video_id: r.score for r in rec}
    max_views = max((v.view_count or 0) for v in videos.values()) or 1
    blended = sorted(
        videos.values(),
        key=lambda v: -(0.7 * rec_score.get(v.id, 0) + 0.3 * (v.view_count or 0) / max_views),
    )
    return blended[offset : offset + limit]
```

### 4. Cold-start fallback chain

When your primary path returns < `limit` items, recursively call
sibling recommenders. RecBole does this for free via its built-in
fallback chain (feed: CF → popularity → recency; watch: I2I →
popularity); for your own policy, compose explicitly:

```python
from . import RECOMMENDERS  # circular-import safe at call time

def get_recommendations(self, db, experiment_id, user_id, limit, offset,
                        exclude_video_ids, current_video_id, algorithm_params):
    primary = self._my_primary_logic(db, experiment_id, user_id, limit, offset,
                                      exclude_video_ids, current_video_id)
    if len(primary) >= limit:
        return primary
    seen = set(exclude_video_ids or []) | {v.id for v in primary}
    fallback = RECOMMENDERS["popularity"].get_recommendations(
        db, experiment_id, user_id, limit - len(primary), 0, list(seen),
        current_video_id, None,
    )
    return primary + fallback
```

---

## Pre-computation / heavy ML models

`get_recommendations` runs on every page load. Heavy training (gradient
descent, embedding extraction) belongs in a separate background
service that writes results to `recommendation_cache` or
`item_similarity`; your `get_recommendations` then just reads.

Pattern: see `backend/app/services/recbole_trainer.py` and
`backend/app/services/training_scheduler.py`.

```
┌─────────────────┐  60-min schedule   ┌──────────────────────────┐
│ training_       │ ─────────────────► │ <your_trainer>.train_*() │
│  scheduler.py   │                    │   loads events, fits,    │
│                 │                    │   writes RecCache rows   │
└─────────────────┘                    └──────────────────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────────┐
                                       │ recommendation_cache     │
                                       │   (user_id, video_id,    │
                                       │    score, algorithm)     │
                                       └──────────────────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────────┐
                                       │ <your_recommender>.get_  │
                                       │  recommendations()       │
                                       │  reads from cache table  │
                                       └──────────────────────────┘
```

The cache table is also writable by an admin endpoint (the
`POST /admin/training/...` family), which is how researchers trigger
ad-hoc re-training from the admin UI. Reuse those endpoints for your
own training trigger by following the same pattern.

---

## Constraints to keep in mind

### 1. Synchronous

`get_recommendations` is `def`, not `async def`. **Do not call external
HTTP services directly** from inside it — a blocking `requests.post`
holds the worker thread. (External-service integration is the upcoming
HTTP recommender track; that's the path researchers should take when
they want to call out.)

### 2. Stateless instance

`RECOMMENDERS["foo"] = FooRecommender()` is created once at process
start; the same instance serves every request. Don't put per-user
state on `self` — store it in the database or compute it in-method.
Caches that benefit all users (e.g., a class-level lookup table) are
fine if you populate them lazily under a lock.

### 3. Read-mostly

You technically have a writable `db` session. Use `db.query()` freely;
avoid `db.add() / db.commit()` inside the recommender — write
side-effects belong in dedicated services so the request path stays
hot. The exception is the platform's own bookkeeping (e.g., updating
RecBole's training run status), which lives in the trainer service,
not here.

### 4. Always filter by `experiment_id`

Forget this once and your test-experiment recommender starts returning
videos from a different experiment. Every query touching `videos` /
`events` should include `Video.experiment_id == experiment_id`.

---

## Testing

There is no shipped pytest harness for recommenders today; the
practical path is browser-side e2e:

1. Add the new file + register it (steps 1–3 above).
2. `docker compose restart backend` and watch logs for import errors:
   ```bash
   docker compose logs -f backend | grep -i error
   ```
3. Verify the policy is registered:
   ```bash
   curl -s -b cookies.txt http://localhost:8080/api/v1/admin/recommenders \
     | python3 -m json.tool
   ```
   Your new key should appear with the `meta` you set.
4. Assign it to a user group via the **Edit algorithm** modal.
5. Log in as a user in that group and load the feed / watch page.
6. Inspect what fired:
   ```sql
   SELECT event_type, COUNT(*)
   FROM events e
   JOIN sessions s ON e.session_id = s.id
   JOIN users u ON s.user_id = u.id
   WHERE u.login_id = '<your-test-user>'
   GROUP BY event_type;
   ```

For unit-level testing, instantiate the recommender directly and pass
a real `Session`:

```python
from app.database import SessionLocal
from app.recommenders.category_match import CategoryMatchRecommender

db = SessionLocal()
rec = CategoryMatchRecommender()
videos = rec.get_recommendations(
    db, experiment_id, user_id, limit=10, offset=0,
    exclude_video_ids=None, current_video_id=None, algorithm_params=None,
)
```

---

## Debugging

- **The new key isn't in `/admin/recommenders`** — most likely an
  import error. Check `docker compose logs backend` for traceback.
  Common cause: `from ..models.something_that_does_not_exist`.
- **The dropdown shows the new key but selecting it returns no
  videos** — your filter is too narrow (forgot `experiment_id`?), or
  `exclude_video_ids` exhausted the candidate set. Add
  `logger.info(...)` and watch backend logs.
- **`422 Unknown algorithm '...'`** — the registry key in
  `RECOMMENDERS` doesn't match what the user group is using. Check the
  `algorithm_config` JSONB on `user_groups`.
- **`422 Recommender '...' does not support the feed surface`** —
  you set `supports_feed = False` but a group is trying to assign it
  to the feed surface. Either flip the flag or change the group's
  config.

---

## Built-in recommenders

For reference, the five built-ins:

| Key | Class | Surface | Description |
|-----|-------|:------:|-------------|
| `random` | `RandomRecommender` (`recommenders/random.py`) | feed + watch | Random shuffle. Control / baseline. |
| `popularity` | `PopularityRecommender` (`recommenders/popularity.py`) | feed + watch | `view_count desc`. Non-personalized popularity. |
| `recency` | `RecencyRecommender` (`recommenders/recency.py`) | feed + watch | `created_at desc`. Temporal baseline (replaces `chronological`). |
| `similarity` | `SimilarityRecommender` (`recommenders/similarity.py`) | watch only | TF-IDF cosine on `title + description + tags`. Cold-start friendly content baseline. |
| `recbole` | `RecBoleRecommender` (`recommenders/recbole.py`) | feed + watch | Learned policy. Reads from pre-computed `recommendation_cache` (U2I) / `item_similarity` (I2I). Fallback chain on cold start. Per-group model selection via `algorithm_params={"model": "BPR"}` etc. |

Each one is a complete reference implementation; copy the closest one
to your new file and edit from there.

---

## Things this guide does NOT cover

- **HTTP / external recommender integration** — for non-Python and
  externally hosted models, see
  [`adding-an-external-recommender.md`](./adding-an-external-recommender.md).
- **Push-style ingestion** — Informfully-style "external service POSTs
  pre-computed lists into the platform". The video domain (especially
  the watch surface) doesn't benefit from push, so this isn't planned.
  If you need the equivalent, write directly to `recommendation_cache`
  via the existing admin training endpoints, or via psql.
- **Frontend customization** — adding a recommender is backend-only
  with this guide. The admin dropdown auto-discovers the new policy.
  UI authoring is covered in
  [`docs/adding-a-ui.md`](./adding-a-ui.md) and
  [`docs/editor-block-reference.md`](./editor-block-reference.md).
