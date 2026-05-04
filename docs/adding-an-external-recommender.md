# Adding an external recommender (HTTP)

External recommenders integrate any HTTP-speaking service as a
first-class policy in VidRecLab — exactly the same admin UI dropdown,
the same `algorithm_config.feed` / `.watch` JSONB, the same standardized
events. This is the integration path for non-Python systems
(TensorFlow Serving, Triton, vLLM, an R or Java service, a colleague's
already-deployed model) and for Python services that already live
somewhere else.

If you can write the policy in Python and want it inside the platform
process, use [`adding-a-recommender.md`](./adding-a-recommender.md)
instead — that path has direct DB access, lower latency, and no extra
moving parts.

## When to choose HTTP over the Python plug-in

| You are doing this | Use |
|--------------------|-----|
| Writing a new algorithm in Python that can read VidRecLab's events / videos / similarity tables directly | Python plug-in |
| Wrapping an existing TF Serving / Triton / vLLM endpoint | **HTTP (this doc)** |
| Hosting a colleague's R / Java / Go model | **HTTP** |
| Already running a model service for another platform | **HTTP** |
| Heavy ML model that should run on its own machine / GPU | **HTTP** |
| Want to deploy independently from the platform release cycle | **HTTP** |

## TL;DR

1. Run your service somewhere reachable from the backend container.
2. Make sure it returns a JSON payload containing video IDs.
3. `POST /admin/recommenders` to register it. The admin UI dropdown
   picks up the new key on next page load.
4. Assign it to a user group via the **Edit algorithm** modal.
5. Done. Researchers using that group hit your service at request time.

No backend rebuild. No code change in the platform.

## The request the platform sends

For each recommendation request (a feed page load or a watch page
load), the dispatcher invokes your `HTTPRecommender` instance, which
substitutes runtime values into your configured `body_template` and
sends a single HTTP call.

Default body (when `body_template` is omitted in the registration
config):

```json
{
  "user_id": "<UUID>",
  "experiment_id": "<UUID>",
  "limit": 21,
  "offset": 0,
  "current_video_id": null,
  "exclude_video_ids": ["<UUID>", "<UUID>", "..."]
}
```

- `current_video_id` is `null` for feed requests, set to the page-pinned
  video for watch-page requests.
- `exclude_video_ids` is the platform-computed watched-history list
  (videos with ≥ 1s play or `VIDEO_ENDED`). Your service should *not*
  return any of these.
- `limit` is one greater than the page size — the platform peeks one
  extra to detect "has more".

You can override this body shape with a custom `body_template` (see
[Config reference](#config-reference)).

## The response the platform expects

A JSON document containing video IDs at a path you specify
(`video_id_path`). The order of the IDs is preserved — that's how the
platform learns your ranking.

Examples that all parse correctly:

```json
{ "video_ids": ["uuid1", "uuid2", "uuid3"] }
```
Path: `"video_ids"`

```json
{
  "items": [
    { "video_id": "uuid1", "score": 0.94 },
    { "video_id": "uuid2", "score": 0.78 }
  ]
}
```
Path: `"items.*.video_id"` (the `*` iterates list elements)

```json
{
  "data": { "recommendations": ["uuid1", "uuid2"] }
}
```
Path: `"data.recommendations"`

The platform expects valid UUID strings. Anything that doesn't parse
as a UUID is silently dropped. IDs that aren't in the experiment's
video pool are also dropped (so you can return more candidates than
you have valid videos and let the platform filter).

## Registering your service

```bash
curl -X POST http://localhost:8080/api/v1/admin/recommenders \
  -b admin_cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "my-tf-model",
    "kind": "external_http",
    "label": "My TF Model",
    "description": "Sequential model trained on click streams.",
    "category": "external",
    "supports_feed": true,
    "supports_watch": false,
    "config": {
      "url": "http://my-service.internal:8080/recommend",
      "video_id_path": "items.*.video_id",
      "timeout_seconds": 5,
      "body_template": {
        "user": "{user_id}",
        "context_video": "{current_video_id}",
        "n": "{limit}",
        "skip": "{offset}",
        "blocked": "{exclude_video_ids}"
      }
    }
  }'
```

Required fields: `key`, `kind` (`"external_http"`), `label`,
`config.url`. Everything else has a default. The URL must be reachable
from inside the backend container — `localhost` on the host machine is
*not* what the backend sees; use a service name reachable in your
deployment (`host.docker.internal` for Docker Desktop on macOS, a
container name on a shared docker network, or a real DNS name).

After registration:

- The recommender is dispatchable on the worker that handled the POST
  immediately. Sibling workers see it on cache miss (the dispatcher
  runs a single SELECT-by-key fallback) or on next backend restart.
- The admin UI's algorithm dropdown shows it on next page load.

## Config reference

The `config` JSONB on a `recommender_registry` row drives the call
shape.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `url` | string | (required) | Endpoint to call. |
| `method` | string | `"POST"` | `"POST"` or `"GET"`. GET sends body as query params. |
| `timeout_seconds` | float | `5.0` | Total request timeout. Failed / slow calls return an empty list (the dispatcher will surface an empty feed for that request, not a 5xx). |
| `headers` | object | `{}` | Sent on every call. Useful for auth tokens. |
| `body_template` | object | (default body, see above) | A JSON-shaped template with `{placeholder}` strings substituted from the request context. |
| `video_id_path` | string | `"video_ids"` | Dotted path inside the response JSON pointing to the video ID list. `*` is the wildcard for list iteration. |

Available placeholder names:

| Placeholder | Type | Notes |
|-------------|------|-------|
| `{user_id}` | string (UUID) | The current user. |
| `{experiment_id}` | string (UUID) | The experiment scope. |
| `{limit}` | integer | Max results requested. |
| `{offset}` | integer | Pagination offset. |
| `{current_video_id}` | string (UUID) or `null` | `null` on feed; set on watch. |
| `{exclude_video_ids}` | list of UUID strings | Already-watched IDs the platform precomputed. |

Anything you put under `algorithm_params` on the user group's `config`
JSONB is also exposed as `{key}` placeholders, so the same registered
recommender can serve as A/B variants:

```jsonc
// User group config (set via Edit algorithm modal):
{
  "my-tf-model": {"top_k": 50, "temperature": 0.7}
}
// In your body_template:
{
  "user": "{user_id}",
  "n": "{top_k}",         // → 50
  "temp": "{temperature}" // → 0.7
}
```

## Capability flags

`supports_feed` and `supports_watch` declare which pages your service
can serve. The platform's schema validator rejects bad assignments at
group-edit time — a watch-only service can't be set as `feed`. Set
both to `true` only if your service handles a missing
`current_video_id` gracefully (i.e., your endpoint is happy with
`null`).

## Behaviour on failure

The platform is **defensive about external service failures**:

| Failure | Platform behaviour |
|---------|--------------------|
| Connection refused / DNS error | Logs warning, returns empty list |
| Timeout exceeded | Logs warning, returns empty list |
| HTTP 5xx response | Logs warning, returns empty list |
| Response not valid JSON | Logs warning, returns empty list |
| Path resolves to non-list | Returns empty list |
| All returned IDs are invalid UUIDs | Returns empty list |
| All returned IDs not in experiment pool | Returns empty list |

The dispatcher treats an empty result as "no recommendations for this
request" and surfaces an empty feed/watch panel — not a 5xx. That's
the correct behaviour for a research platform: a single bad model
should not crash the participant's session. Tail the backend logs for
diagnostics:

```bash
docker compose logs -f backend | grep HTTPRecommender
```

If you want a fallback (e.g., RecBole + popularity when your model is
down), the cleanest path is to compose at the user-group level: run
two groups, one with your external recommender and one with a baseline,
and swap them in monitoring sees sustained failure. Per-recommender
fallback chaining lives in the platform's RecBole code today; building
your own chain in Python is a few extra lines (see [the Python
recommender doc's "Cold-start fallback chain" recipe](./adding-a-recommender.md#4-cold-start-fallback-chain)).

## Updating your service

`PATCH /admin/recommenders/{key}` partial-updates a registered
recommender. Send only the fields you want to change:

```bash
curl -X PATCH http://localhost:8080/api/v1/admin/recommenders/my-tf-model \
  -b admin_cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{
    "config": {
      "url": "http://my-service.internal:8080/v2/recommend",
      "video_id_path": "items.*.video_id",
      "timeout_seconds": 8,
      "body_template": { "user": "{user_id}", "n": "{limit}" }
    }
  }'
```

Patchable fields: `label`, `description`, `category`, `supports_feed`,
`supports_watch`, `config`. The `key` and `kind` are immutable —
re-register if you need to change them.

After commit, the cached instance is rebuilt on the worker that
handled the PATCH. Sibling workers refresh their cache on next
dispatch miss for that key (one-shot DB lookup) or on backend
restart. In practice the change is invisible because the miss-refresh
path runs on first request after PATCH.

Built-ins (`random`, `popularity`, `recency`, `similarity`, `recbole`)
accept only metadata edits (label / description / category) via
PATCH — capability flags and config for built-ins live in the Python
class. Trying to flip `supports_feed` or set `config` on a built-in
returns 400 to surface the inconsistency.

## Removing your service

```bash
curl -X DELETE http://localhost:8080/api/v1/admin/recommenders/my-tf-model \
  -b admin_cookies.txt
```

Built-in recommenders are protected — `DELETE` returns 400 for
`random` / `popularity` / `recency` / `similarity` / `recbole`. Only
`external_http` rows can be removed via the API.

If a user group is currently assigned to the recommender you are
removing, the delete still succeeds, but the next request from a user
in that group will get a 5xx (the dispatcher fails to look up the
key). Update the group's `algorithm_config` first, then delete.

## End-to-end check

Once registered:

1. Verify it's listed:
   ```bash
   curl -s -b admin_cookies.txt http://localhost:8080/api/v1/admin/recommenders | jq
   ```
   Your key should appear with `kind: "external_http"`.

2. Assign to a test group via the admin UI's **Edit algorithm** modal.
   Confirm the validator accepts it.

3. Log in as a user in that group and load the feed (or watch a
   video). Watch backend logs for the outgoing call:
   ```bash
   docker compose logs -f backend | grep -E "(HTTPRecommender|GET /feed)"
   ```

4. Check that the events table records the same standard schema as it
   does for built-in policies — the surface primitives, not the
   recommender, emit events. If you see PAGE_LOAD / IMPRESSION /
   FEED_CLICK firing, the integration is working end-to-end:
   ```sql
   SELECT event_type, COUNT(*) FROM events e
   JOIN sessions s ON e.session_id = s.id
   JOIN users u ON s.user_id = u.id
   WHERE u.login_id = '<your-test-user>'
   GROUP BY event_type;
   ```

## Limits worth knowing

- **Synchronous calls.** The current implementation uses blocking
  `requests.post`. With the default 4 uvicorn workers and ~5s timeout,
  ~20 concurrent slow requests can saturate the pool. Lab-scale
  studies (≤ 30 concurrent users) are not affected; a planned async
  upgrade lifts this for production traffic.
- **No response caching.** Every request hits your service. If your
  model is slow and returns the same list for a given user for many
  minutes, host a cache layer in front of your service (or run an
  HTTP proxy with TTL caching). The platform itself does not cache
  your response.
- **Eventual consistency across workers.** Registrations are visible
  on the registering worker immediately and on sibling workers after
  the first dispatch miss (one-shot DB lookup) or at next backend
  restart. The "miss → DB-refresh" path makes this invisible in
  practice.

## See also

- [`adding-a-recommender.md`](./adding-a-recommender.md) — the
  in-process Python plug-in path. Covers the contract, available DB
  tables, event types, and recipes — much of which applies equally
  well when your external service queries our DB directly (e.g. via
  read replicas) instead of receiving the request body.
- [`event-schema.md`](./event-schema.md) — the standardized
  measurement contract that fires regardless of which recommender
  served the page.
