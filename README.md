# WatchLens

**A Configurable Platform for Online Video Recommendation Experiments.**

WatchLens is an open-source video-native experimentation platform for
configuring, deploying, logging, and analyzing online video recommendation
experiments within a single deployable system. Researchers can vary the
**user interface**, **content pool**, and **recommendation policy**
independently, while a fixed measurement layer records exposure-aware
playback events under a single common schema.

> The platform is described in our paper: **"WatchLens: A Configurable
> Platform for Online Video Recommendation Experiments"** (RecSys 2026
> submission, single-blind). The repository name on GitHub is
> `VidRecLab`, the platform's working title during development; the paper
> and this document use the public name **WatchLens**.

**Authors.** Deogyong Kim ([legenduck@yonsei.ac.kr](mailto:legenduck@yonsei.ac.kr))
and Dongha Lee ([donalee@yonsei.ac.kr](mailto:donalee@yonsei.ac.kr),
corresponding author), Yonsei University.

---

## Why WatchLens

Online studies with real users are essential for understanding how video
recommender systems shape consumption behavior, but the engineering cost
of running such studies is high. Before testing any research question, a
team typically has to (re-)build experimental interfaces, video serving,
recommender integrations, playback logging, and analysis-ready export
pipelines. Existing user-study platforms cover content delivery and
generic interaction logging, but their event logs are not natively linked
to **recommendation exposure context** (the policy that produced an
impression and at what position) — a gap that is acute in video, where
session-level behaviors such as playback continuity and surface
transitions are the primary signals of recommendation quality.

WatchLens addresses this by making three things first-class capabilities
of the platform:

1. **Modular configuration** — UI, content pool, and recommendation
   policy are independently swappable per experimental group.
2. **Standardized, exposure-aware measurement** — every UI emits the same
   33-event schema linking each playback event with the policy and
   ranking position behind the corresponding impression.
3. **Video-native metrics** — watch duration, watch ratio, session
   length, single-video-session rate, and transitions out of the watch
   page are computed and exported alongside the raw event log.

The asymmetry is the load-bearing claim: **execution is configurable;
measurement is standardized.** That makes "compare condition A vs. B" an
SQL question, not a re-instrumentation question.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CONFIGURABLE — execution layer                                 │
│  ─ User interface  (built-in presets / visual / code editor)    │
│  ─ Content pool    (local files or external embeds)             │
│  ─ Policy plug-in  (Python in-process or external HTTP)         │
└──────────────┬──────────────────────────────────────────────────┘
               │  data flow │ event emission with exposure context
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  STANDARDIZED — measurement contract                            │
│  ─ Data hooks       (useFeed / useVideo / useRelated / …)       │
│  ─ Surface trackers (FeedSurface / WatchSurface / VideoSurface) │
│  ─ Event Collector  (33 events × 6 categories → events table)   │
│  ─ Metrics + export (per-group + per-user; CSV-ready)           │
└─────────────────────────────────────────────────────────────────┘
```

Components:

| Component | Stack | Role |
|-----------|-------|------|
| **Frontend** | React 18 · TypeScript · Vite · Tailwind | Renders UIs; surface primitives wrap every page so events are emitted automatically. |
| **Backend** | FastAPI · SQLAlchemy 2 · PostgreSQL 15 (JSONB) | Hosts experiment config, the event collector, the recommender plug-in layer, and analysis endpoints. |
| **Plug-in layer** | Python interface (`BaseRecommender`) + HTTP adapter | Built-in policies, custom in-process Python policies, and externally hosted HTTP services share a single calling contract. |
| **Auth** | JWT (HttpOnly cookie, SameSite=Lax) + bcrypt | Per-participant auth and admin authentication. |
| **Deploy** | Docker Compose (db, backend, frontend, data-nginx) | Single-server deployment; reproducible setup. |

---

## What's bundled

### Built-in recommendation policies

Five policies ship with the platform; researchers add their own via the
plug-in layer (see [Adding a recommender](#adding-a-recommender)).

| Key | Class | Surface | Notes |
|-----|-------|:-------:|-------|
| `random` | baseline | feed + watch | Random shuffle. Control. |
| `popularity` | baseline | feed + watch | Sort by `view_count` desc. |
| `recency` | baseline | feed + watch | Sort by `created_at` desc. |
| `similarity` | baseline | watch only | TF-IDF cosine on title + description + tags; cold-start friendly. |
| `recbole` | learned | feed + watch | RecBole [Zhao et al., 2021] integration; trains from the events table on a schedule, serves from a precomputed cache, with a popularity / recency fallback. |

External (HTTP) recommenders are registered at runtime via the admin API
without code changes — see
[`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md).

### Built-in user interfaces

| Key | Surface | Description |
|-----|:-------:|-------------|
| `youtube` | feed + watch | Long-form: 16:9 grid feed + aspect-video player + sidebar of related cards. |
| `tiktok`  | feed + watch | Short-form: 9:16 thumbnail grid feed + split-screen watch with comments / related tabs. |
| `none`    | feed only    | Disables the feed page; participants land directly on the first watchable video on `/`. |

Researchers can also author custom UIs through:

- **Visual editor** — composes a UI from 19 atomic / container / data-bound
  blocks. The editor saves a block tree (JSONB) which is rendered by
  `BlockTreeRenderer` at runtime.
- **Code editor** — write a default-exported React component in the
  admin Code editor; the platform compiles it in-browser via
  [sucrase](https://github.com/alangpierce/sucrase) and renders it
  directly. No build step.
- **Eject** — visual templates can be ejected to TSX in one click and
  edited further as Code-track templates.

Both tracks build on the same data hooks and surface primitives, so the
event schema is identical across authoring paths.

### Standardized event schema

Every UI emits the same 33 events grouped into six categories: session
lifecycle (2), page navigation (3), video metadata (1), playback (8) +
player controls (3), impressions (3), user interactions (6),
high-frequency telemetry (3), tab/window state (3), and layout (1). Each
event row carries the active recommendation policy and the
`position_in_feed` of the impression that produced it, so policy effects
on playback behavior can be analyzed by joining a single table.

Full payload contracts and batching rules (5 s / 20 events normal; 2 s /
50 events high-frequency; immediate flush on `VIDEO_ENDED`, `LIKE`,
`DISLIKE`, `SESSION_END`, `PAGE_EXIT`; `sendBeacon` on unload) are in
[`docs/event-schema.md`](./docs/event-schema.md).

### Built-in metrics

Computed per group and aggregated, exposed in the admin **Stats** tab,
and exported to CSV alongside the raw event log:

- **CTR** — click-through rate on impressions.
- **NDCG@K**, **Precision@K** — ranking quality with click-as-relevance.
- **Average watch ratio** — mean of `watch_duration / video_duration`
  across `VIDEO_ENDED` events.
- **Engagement rate** — fraction of impressions that received a click or
  a like.

Researchers can derive additional video-native quantities (cumulative
watch time, session length, single-video session rate, return-to-feed
rate, exit rate, …) from the exported event log; the case study
described in our paper uses exactly this path.

---

## Quick start

```bash
git clone https://github.com/legenduck/VidRecLab.git
cd VidRecLab
cp .env.example .env                  # edit secrets (POSTGRES_PASSWORD, SECRET_KEY, ADMIN_PASSWORD)
docker compose up -d --build          # db + backend + frontend + data-nginx
```

The frontend is served on the host port set in `.env` (default `8080`).
Sign in to `/login` with `ADMIN_LOGIN_ID` / `ADMIN_PASSWORD` from `.env`.

Then:

1. **Create an experiment** in the admin **Experiments** tab.
2. **Upload videos** via CSV (`video_id`, `url`, `duration`, `title`, …
   — see [`docs/`](./docs/) for the column schema), or drop a dataset
   folder under `data/<name>/` matching the auto-import layout
   (`*_videos.csv`, `*_comments.csv`, `videos/`, `thumbnails/`).
3. **Create user groups** under the experiment. Each group carries its
   own `algorithm_config` (`{feed, watch}`) and `ui_config`
   (`{feed, watch}`).
4. **Bulk-create participants** assigned to groups. The admin UI lets
   you download login_id/password CSV once at creation.
5. **Set the experiment to `active`**. Participants log in and use the
   platform; events stream into the database in real time.
6. **Monitor** through the admin **Stats** tab, **export** the events
   CSV when the study concludes.

---

## Adding a recommender

WatchLens accepts new recommendation policies through two equally
first-class paths:

### Python plug-in (in-process)

```python
# backend/app/recommenders/my_policy.py
from .base import BaseRecommender, RecommenderMeta

class MyRecommender(BaseRecommender):
    meta = RecommenderMeta(
        label="My Policy",
        category="baseline",
        description="One-sentence description shown in the admin UI.",
    )
    supports_feed = True
    supports_watch = True

    def get_recommendations(self, db, experiment_id, user_id, limit, offset,
                            exclude_video_ids=None, current_video_id=None,
                            algorithm_params=None):
        # query db, return List[Video]
        ...
```

Register the instance in `backend/app/recommenders/__init__.py`
(`BUILTIN_INSTANCES["my_policy"] = MyRecommender()`), restart the
backend, and the new key appears in the admin algorithm dropdown. There
are no Pydantic / TypeScript Literal updates to keep in sync — the
schema validator accepts any registered key. Full walkthrough, recipes,
and constraints in
[`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md).

### External HTTP service

A model already running elsewhere (TF Serving, Triton, vLLM, an R / Java
/ Go service, an existing colleague's deployment) is integrated by
**registering its endpoint** through the admin API; no code change in
the platform.

```bash
curl -X POST http://localhost:8080/api/v1/admin/recommenders \
  -b admin_cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "my-tf-model",
    "kind": "external_http",
    "label": "My TF Model",
    "supports_feed": true,
    "supports_watch": false,
    "config": {
      "url": "http://my-service.internal:8080/recommend",
      "video_id_path": "items.*.video_id",
      "body_template": {"user": "{user_id}", "n": "{limit}"}
    }
  }'
```

The dispatcher calls the URL on every recommendation request, parses the
configured response path, and returns the matching videos. Failures
(timeout / 5xx / malformed JSON / unknown video IDs) return an empty
list rather than a 5xx — a single bad model never crashes a participant
session. Full reference in
[`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md).

---

## Adding a user interface

Three entry points share the same data hooks and surface primitives:

| Track | Source lives in | Compile path | When to use |
|-------|-----------------|--------------|-------------|
| Code preset | `frontend/src/ui-presets/<key>/{feed,watch}.tsx` (git) | Vite build | UIs you want to ship as built-ins. |
| Admin Code editor | `ui_templates.code_text` (DB) | sucrase, in-browser | Researcher-authored TSX without build; per-template; survives across sessions. |
| Admin Visual editor | `ui_templates.feed_tree` / `watch_tree` (DB JSONB) | `BlockTreeRenderer` | Compose 19 blocks visually; eject to TSX when you outgrow the library. |

A minimal preset:

```tsx
// frontend/src/ui-presets/my-ui/feed.tsx
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'

export default function MyFeed(): JSX.Element {
  const navigate = useNavigate()
  const { videos } = useFeed()
  return (
    <FeedSurface videos={videos}>
      <div className="grid grid-cols-3 gap-4 p-6">
        {videos.map((v, i) => (
          <VideoSurface key={v.id} video={v} position={i} context="feed"
                        onClick={() => navigate(`/watch/${v.video_id}`)}>
            <article>
              <img src={v.thumbnail_url ?? ''} alt="" />
              <h3>{v.title}</h3>
            </article>
          </VideoSurface>
        ))}
      </div>
    </FeedSurface>
  )
}
```

Twenty-eight or more distinct event types in the database for a
single-user walkthrough is the typical "preset works" threshold. Full
guides:

- [`docs/adding-a-ui.md`](./docs/adding-a-ui.md) — the preset + Code-editor flow.
- [`docs/editor-block-reference.md`](./docs/editor-block-reference.md)
  — the 19 visual-editor blocks, their props, and composition recipes.

---

## Repository layout

```
backend/
  app/
    api/v1/        REST endpoints (auth, feed, events, sessions, admin)
    models/        SQLAlchemy ORM (Experiment, UserGroup, User, Video, Event, …)
    recommenders/  BaseRecommender + 5 built-ins + HTTPRecommender
    schemas/       Pydantic request/response + validators
    services/      Auth, RecBole training pipeline, scheduler, item-similarity
  alembic/         Database migrations (head: 019_ui_config_simplify)

frontend/
  src/
    ui-runtime/    Standardized contract — data hooks, surfaces, block runtime, sucrase compiler
    ui-presets/    Built-in UI presets (youtube, tiktok) + dispatcher registry
    pages/         User pages (Feed, VideoWatch, Login) + admin pages
    components/    VideoPlayer, VideoCard, CommentSection, Header, ui-editor/
    contexts/      AuthContext, EventContext (event batching, session lifecycle)
    api/           Typed client wrappers around the backend

docs/              Reference manuals (event schema, recommender / UI authoring, block reference)
data/              Dataset drop-zone for auto-import (gitignored)
docker-compose.yml Single-server deployment
```

---

## Documentation

| Document | Topic |
|----------|-------|
| [`docs/event-schema.md`](./docs/event-schema.md) | 33 event types, payload contracts, batching rules, backend consumers. |
| [`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md) | Python-track recommender authoring — contract, available data, recipes, constraints. |
| [`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md) | HTTP-track recommender — register any external service via the admin API. |
| [`docs/adding-a-ui.md`](./docs/adding-a-ui.md) | Code-track preset authoring; admin Code-editor flow. |
| [`docs/editor-block-reference.md`](./docs/editor-block-reference.md) | Visual editor block library — 19 blocks, props, slot semantics, composition recipes. |
| [`docs/phase1-verification.md`](./docs/phase1-verification.md) | Click-by-click recipe for verifying surface event emission end-to-end. |

---

## Reproducing the paper's case study

The paper reports a within-subject counterbalanced study comparing two
watch-page recommendation policies (similarity-based vs. diversity-based)
under a fixed feed policy, content pool, and interface. The interface
was the bundled `tiktok` preset modified through the visual editor to
replace automatic swipe transitions with click-based transitions. The
content pool was 1,000 popular short-form videos drawn from five
categories.

To reproduce the experimental setup with your own participants and
content:

1. **Provision the platform** as in [Quick start](#quick-start).
2. **Curate a content pool**: drop a CSV under `data/<your-pool>/` and
   run the auto-import from the admin Datasets tab.
3. **Configure the two policies** as group-level
   `algorithm_config.watch` values (the paper used `similarity` and a
   custom diversity policy; the latter is registered as a Python
   plug-in following [`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md)).
4. **Modify the TikTok preset** in the visual editor to use click
   transitions on the watch page (or use the bundled `tiktok` preset
   as-is for swipe transitions).
5. **Create two user groups** with the two watch policies, balanced on
   any baseline you measure with a pre-study survey.
6. **Run** the experiment for the duration of your study; **export** the
   events CSV from the admin Stats tab; analyze with the toolchain of
   your choice (the paper uses standard Python statistical libraries on
   the per-event log).

---

## Citation

```bibtex
@inproceedings{kim2026watchlens,
  title     = {WatchLens: A Configurable Platform for Online Video Recommendation Experiments},
  author    = {Kim, Deogyong and Lee, Dongha},
  booktitle = {Proceedings of the 20th ACM Conference on Recommender Systems (RecSys '26)},
  year      = {2026},
  note      = {Under review},
}
```

---

## Status and contributing

WatchLens is under active development at Yonsei University. The codebase
is released alongside the paper submission to support reproducibility.
Issues, pull requests, and extensions of the platform (additional UI
presets, recommendation policies, datasets, video adapters) are welcome.

## License

MIT.
