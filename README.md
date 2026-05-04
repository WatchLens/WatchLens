# WatchLens

A configurable, open-source platform for **online video recommendation
experiments** — vary the UI, content pool, and recommendation policy
independently while every interface emits the same exposure-aware event
schema.

> The repository name is `VidRecLab` (working title); the platform is
> presented as **WatchLens** in our RecSys 2026 paper.

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
  recommendation policy and feed position attached to every row.
- **Built-in metrics.** CTR, NDCG@K, Precision@K, watch ratio,
  engagement rate — per-group, per-user, and full CSV export.
- **RecBole integration.** Scheduled training over the events table
  with a CF → I2I → popularity → recency fallback chain.
- **Single-server deploy.** Docker Compose: `db`, `backend`, `frontend`,
  `data-nginx`.

---

## Quick start

```bash
git clone https://github.com/legenduck/VidRecLab.git
cd VidRecLab
cp .env.example .env       # set POSTGRES_PASSWORD, SECRET_KEY, ADMIN_PASSWORD
docker compose up -d --build
```

Open `http://localhost:8080`, sign in with `ADMIN_LOGIN_ID` /
`ADMIN_PASSWORD`, then in the admin UI:

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

## Documentation

| Doc | |
|-----|---|
| [`docs/event-schema.md`](./docs/event-schema.md) | 33 event types, payload contracts, batching rules |
| [`docs/adding-a-recommender.md`](./docs/adding-a-recommender.md) | Python recommender plug-in guide |
| [`docs/adding-an-external-recommender.md`](./docs/adding-an-external-recommender.md) | External HTTP service integration |
| [`docs/adding-a-ui.md`](./docs/adding-a-ui.md) | UI authoring (code track + editors) |
| [`docs/editor-block-reference.md`](./docs/editor-block-reference.md) | 19 visual-editor blocks |
| [`docs/phase1-verification.md`](./docs/phase1-verification.md) | Event-emission verification recipe |

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

## License

MIT.
