# WatchLens

A configurable, open-source platform for **online video recommendation
experiments** — vary the UI, content pool, and recommendation policy
independently while every interface emits the same exposure-aware event
schema.

---

## Features

- **Pluggable recommendation policies.** 5 built-ins (`random`,
  `popularity`, `recency`, `similarity`, `recbole`). Add your own as
  Python plug-ins or register externally hosted services through HTTP.
- **Three ways to author a UI.** Bundled `youtube` / `tiktok` presets,
  an in-browser code editor (TSX compiled at runtime via sucrase), and a
  visual block-tree editor with 19 composable blocks. All three emit the
  same event schema.
- **Standardized event schema.** 33 events × 6 categories (session,
  navigation, playback, impressions, interactions, browser state) with
  per-surface recommender keys (feed + watch) and feed position
  attached to every row.
- **Built-in metrics.** CTR, average watch time, watch ratio
  (median + IQR), session length (median videos), session duration
  (median seconds) — per-group, with full CSV event export.
- **Built-in surveys.** Pre-study (forced gate), post-study, and
  inter-session (asks about the prior session) — single / multi /
  open-ended questions with quantized answer values for analysis. CSV
  export per survey.
- **RecBole integration.** Scheduled training over the events table.
  Feed serves CF → popularity → recency fallback; watch serves I2I →
  popularity (with internal model→`auto` similarity fall-through).
- **Single-server deploy.** Docker Compose: `db`, `backend`, `frontend`,
  `data-nginx`.

---

## Quick start (local)

```bash
git clone https://github.com/WatchLens/WatchLens.git
cd WatchLens
cp .env.example .env       # set POSTGRES_PASSWORD, SECRET_KEY, ADMIN_PASSWORD
docker compose up -d --build
```

Open `http://localhost:8080` (override via `HOST_PORT` in `.env`), sign
in with `ADMIN_LOGIN_ID` / `ADMIN_PASSWORD`, then in the admin UI:

1. Create an experiment.
2. Upload videos via CSV, or drop a dataset under `data/<name>/` for
   auto-import.
3. Create user groups (each with its own `algorithm_config` and
   `ui_config`).
4. Bulk-create participants assigned to groups.
5. Set the experiment to `active`. Events stream into the database.
6. Monitor metrics in the **Stats** tab; export the events CSV when the
   study concludes.

---

## Deployment for user studies

Local dev binds to `127.0.0.1` and serves over plain HTTP. Real user
studies need participants to reach the platform from their own devices,
which means a public hostname, HTTPS, and the matching cookie / CORS
configuration. Set the following in `.env` before bringing the stack
up:

| Variable | Production value | Why |
|----------|-----------------|-----|
| `HOST_BIND` | `0.0.0.0` | Listen on all interfaces (or pair with a reverse proxy). |
| `HOST_PORT` | `80` (or whatever your proxy expects) | Port the host binds. |
| `COOKIE_SECURE` | `true` | Required for the auth cookie to survive over HTTPS. |
| `CORS_ORIGINS` | `["https://your-study.example.org"]` | Allow-list the public origin participants will hit. |
| `SECRET_KEY` | strong random | `openssl rand -hex 32`. |
| `ADMIN_PASSWORD` | strong random | Used for the seeded admin account. |

Put a TLS-terminating reverse proxy (nginx, Caddy, Cloudflare Tunnel)
in front of the frontend container so traffic to participants travels
over HTTPS. The platform itself is HTTP-only inside the Compose
network; everything user-facing is the proxy's responsibility. Do not
expose the backend container directly — the frontend's nginx already
routes `/api` to it.

---

## Stack

| Layer | |
|-------|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind |
| Backend  | FastAPI · SQLAlchemy 2 · PostgreSQL 15 |
| Auth     | JWT (HttpOnly cookie) + bcrypt |
| ML       | RecBole (optional) |
| Compile  | sucrase (in-browser TSX) |

---

## Adding a recommender (Python)

```python
# backend/app/recommenders/my_policy.py
from .base import BaseRecommender, RecommenderMeta

class MyRecommender(BaseRecommender):
    meta = RecommenderMeta(label="My Policy", category="baseline", description="...")
    supports_feed = True
    supports_watch = True

    def get_recommendations(self, db, experiment_id, user_id, limit, offset,
                            exclude_video_ids=None, current_video_id=None,
                            algorithm_params=None):
        ...
```

Register in `backend/app/recommenders/__init__.py`
(`BUILTIN_INSTANCES["my_policy"] = MyRecommender()`) and restart the
backend. The new key appears in the admin algorithm dropdown.

External (HTTP) services are registered live via the admin API:

```bash
curl -X POST http://localhost:8080/api/v1/admin/recommenders \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"key":"my-tf-model","kind":"external_http","label":"My TF Model",
       "supports_feed":true,"supports_watch":false,
       "config":{"url":"http://my-service:8080/recommend",
                 "video_id_path":"items.*.video_id",
                 "body_template":{"user":"{user_id}","n":"{limit}"}}}'
```

Full guides: [`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md),
[`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md).

---

## Adding a UI

Drop a `feed.tsx` + `watch.tsx` pair under `frontend/src/ui-presets/<key>/`
and register in `registry.ts`. Both files use the bundled data hooks
(`useFeed`, `useVideo`, `useRelated`, `useLikes`, …) and surface
primitives (`<FeedSurface>`, `<WatchSurface>`, `<VideoSurface>`); the
event schema is wired automatically.

For non-developer authoring, use the **admin Code editor** (paste TSX,
compiles in-browser) or the **Visual editor** (compose 19 blocks; eject
to TSX when you outgrow the library).

Full guide: [`docs/adding-a-ui.md`](./docs/adding-a-ui.md). Block
reference: [`docs/editor-block-reference.md`](./docs/editor-block-reference.md).

---

## Surveys

Self-report data is captured through three timing kinds — pre-study
(forced gate before feed entry), post-study (after the experiment is
marked completed), and inter-session (asks about the prior session on
new session start). Configure from the admin **Surveys** tab between
**Videos** and **Stats**: pick a kind, write `single` / `multi` /
`text` questions with quantized answer values, toggle `is_active`. The
backend's partial unique indexes enforce "at most one active survey per
kind per experiment" so admins cannot accidentally expose conflicting
prompts.

Full guide: [`docs/surveys.md`](./docs/surveys.md).

---

## Documentation

Hosted: **https://watchlens.github.io**. Source markdown:

| Doc | |
|-----|---|
| [`docs/event-schema.md`](./docs/event-schema.md) | 33 event types, payload contracts, batching rules |
| [`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md) | Python recommender plug-in guide |
| [`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md) | External HTTP service integration |
| [`docs/adding-a-ui.md`](./docs/adding-a-ui.md) | UI authoring (code track + editors) |
| [`docs/editor-block-reference.md`](./docs/editor-block-reference.md) | 19 visual-editor blocks |
| [`docs/device-routing.md`](./docs/device-routing.md) | Per-device UI routing (one template per device, notice page for unconfigured slots) |
| [`docs/surveys.md`](./docs/surveys.md) | Pre / post / inter-session survey system |
| [`docs/phase1-verification.md`](./docs/phase1-verification.md) | Event-emission verification recipe |

---

## License

Released under the [MIT License](./LICENSE).
