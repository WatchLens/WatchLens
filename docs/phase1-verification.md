# Phase 1 verification — surface primitives in the browser

The Phase 1 surfaces emit the standardized event schema automatically.
This doc walks the verification end-to-end so the events table can be
inspected after a real click-through.

The demo at `/dev/surfaces` is a working feed + watch UI written **only**
through the public runtime hooks/surfaces (`SurfaceDemo.tsx`, ~100 lines).
If the surfaces are correct, every event in the schema fires when you
interact with the demo.

## Step 1 — start the stack

You need at least one experiment with videos and at least one user (admin
or non-admin) assigned to a group. If a fresh DB, follow `README.md`'s
Quick start first.

```bash
cd <repo root>            # e.g. /Users/<you>/Project/VidRecLab
docker compose up -d --build
```

The frontend will be at whatever `HOST_PORT` is in `.env` (default
`http://localhost`). Backend at the same host on the `/api/` path through
nginx.

## Step 2 — log in

Open `http://localhost/login` (substitute your `HOST_PORT`) and log in as
any user — admin works fine, the demo route bypasses the usual admin
redirect.

## Step 3 — visit the demo feed

Navigate to **`/dev/surfaces`**. You'll see a 4-column grid of videos
sourced from `/feed`. The page header confirms the route loaded.

Open **DevTools → Network → filter `events/batch`**. Every 5 s a request
should appear. (Mouse-movement and scroll-style events flush every 2 s on
their own buffer, so you may see two batches per cycle.)

Every batch is a JSON POST whose body is `{ session_id, events: [...] }`.
Each event in the array has `event_type`, optional `video_id`, a client
timestamp, optional structured columns, and a `payload`.

## Step 4 — perform the verification actions

Do these in order. After each one, the next batch in DevTools should
include the listed events. Some events flush immediately
(`VIDEO_ENDED`, `LIKE`, `DISLIKE`, `PAGE_EXIT`), others wait for the 5 s /
2 s tick.

| Action | Expected events |
|--------|------------------|
| Page first loads | `SESSION_START` (once per session), `PAGE_LOAD`, `MOUSE_MOVEMENT` (after 2 s), `SCROLL` (if you scroll), `VIEWPORT_VISIBILITY` (after ~3 s, includes positions of cards in view), `HOME_FEED` (one per page of feed videos) |
| Hover a card for ≥ 200 ms then move away | `THUMBNAIL_HOVER` with `followed_by_click=false` |
| Hover a card and click it | `THUMBNAIL_HOVER` with `followed_by_click=true`, `FEED_CLICK`, then `PAGE_EXIT` for the feed and `PAGE_LOAD` + `VIDEO_META_CAPTURED` + `RECOMMENDATIONS` for the watch view |
| On the watch view: press play | `VIDEO_PLAY` |
| Let it play 1 s | `VIDEO_WATCHED_1S` |
| Let it play 5 s | `VIDEO_WATCHED_5S`, periodic `VIDEO_PROGRESS` every 5 s |
| Pause the player | `VIDEO_PAUSE` |
| Drag the timeline to seek | `VIDEO_SEEK` (only if jump > 0.5 s) |
| Press `f` to fullscreen | `KEYBOARD_SHORTCUT`, `FULLSCREEN_CHANGE` |
| Press `,` (Shift+,) for slower playback | `KEYBOARD_SHORTCUT`, `PLAYBACK_RATE_CHANGE` |
| Click the volume slider | `VOLUME_CHANGE` |
| Click 👍 (Like) | `LIKE` (immediate flush) |
| Click 👎 (Dislike) | `DISLIKE` (immediate flush) |
| Click a related video card | `THUMBNAIL_HOVER`, `VIDEO_CLICK` (note: `VIDEO_CLICK` for related cards, `FEED_CLICK` is for the feed page only) |
| Switch to another browser tab | `WINDOW_BLUR`, `VISIBILITY_CHANGE` (visible:false) |
| Switch back | `WINDOW_FOCUS`, `VISIBILITY_CHANGE` (visible:true) |
| Close the tab | `PAGE_EXIT`, `SESSION_END` (sent via `sendBeacon`, find it in DevTools' Network tab under "All" not just XHR) |

If a video plays through to its natural end, `VIDEO_ENDED` fires (immediate
flush). To trigger `VIDEO_BUFFERING`, throttle the network in DevTools
(Network → "Slow 3G") and play a longer video.

`LAYOUT_CHANGE` is the only event the demo doesn't trigger automatically;
production Feed pages emit it when the column count changes. It can be
exercised manually via the `useTracking()` escape hatch — not part of
this round of verification.

## Step 5 — verify in the database

Open a `psql` shell against the running DB:

```bash
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

(Defaults: `watchlens` / `watchlens` — `.env.example`.)

### Recent events for your session

Find your session id by login_id, then list the most recent events:

```sql
SELECT id FROM users WHERE login_id = 'admin' LIMIT 1;
-- copy the user uuid

SELECT id, started_at FROM sessions
WHERE user_id = '<paste user uuid>'
ORDER BY started_at DESC LIMIT 1;
-- copy the session uuid

SELECT event_type, video_id, watch_ratio, position_in_feed,
       payload, server_timestamp
FROM events
WHERE session_id = '<paste session uuid>'
ORDER BY server_timestamp DESC
LIMIT 50;
```

### Distinct event types this session emitted

```sql
SELECT event_type, COUNT(*)
FROM events
WHERE session_id = '<paste session uuid>'
GROUP BY event_type
ORDER BY event_type;
```

The distinct list should include every event in the table from Step 4
plus the periodic ones (`MOUSE_MOVEMENT`, `SCROLL`, `VIEWPORT_VISIBILITY`,
`VIDEO_PROGRESS`).

### Sanity-check a payload

```sql
SELECT payload
FROM events
WHERE session_id = '<paste session uuid>'
  AND event_type = 'VIDEO_META_CAPTURED'
LIMIT 1;
```

Compare the JSON to the `VIDEO_META_CAPTURED` row in
`docs/event-schema.md`: should contain `videoId`, `title`, `channelName`,
`category`, `viewCount`, `description`, `tags`, `duration`, `thumbnailUrl`.

## What "passing" looks like

- DevTools shows `events/batch` POSTs returning 200 with non-empty
  `events` arrays after every action.
- The DB query "Distinct event types" lists ≥ 25 distinct event types
  after a full Step 4 walk-through. Of the 33 documented events, the
  following are not exercised by this demo and may be missing:
  `LAYOUT_CHANGE` (UI-author signal, manual only) and possibly
  `VIDEO_BUFFERING` if the network was fast.
- Payloads match `docs/event-schema.md`.

## What "failing" looks like

- A POST to `events/batch` returns 4xx — probably 403 (`session_id`
  mismatch) or 422 (schema). The 4xx-drop logic in `EventContext` will
  log to the console in DEV mode.
- An event is missing entirely. Cross-reference its row in the schema
  doc; the "Surface" column tells you which surface should have emitted
  it. If that surface isn't mounted on the demo route, the surface
  itself or the demo wiring is wrong.
- Payload shape diverges from the schema. Find the emitter in the
  surface code (most are wrappers around `useVideoTracking` methods) and
  compare what it passes through.

## Removing the demo route

The demo lives at `/dev/surfaces` permanently for now (it's tree-shaken
into a tiny code chunk). Phase 2 will replace it with the production UI
presets, at which point the demo can either stay as a paper-figure
exhibit or be deleted by removing:

1. `frontend/src/ui-runtime/__demo__/SurfaceDemo.tsx`
2. The two `/dev/surfaces` routes and the `SurfaceDemo` import in
   `frontend/src/App.tsx`
3. The `AnyAuthRoute` helper if no other route uses it.
