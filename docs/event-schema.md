# Event Schema

The platform's central engineering claim is the asymmetry between the
**configurable execution layer** (UI / content / recommender, all swappable)
and the **standardized measurement layer** (every UI emits the same event
contract into the same `events` table). This document is the single source
of truth for that contract.

Researchers writing custom UIs do **not** define events. They mount the
provided surface primitives (`<FeedSurface>`, `<WatchSurface>`,
`<VideoSurface>`); each surface emits a subset of the contract on its
behalf. The escape hatch `useTracking()` exists for genuinely new event
types that future research may need.

## Wire format

A single event:

```json
{
  "event_type": "VIDEO_PLAY",
  "video_id": "abc123",            // optional, external id
  "timestamp": "2026-04-30T12:34:56.789Z",  // client clock
  "watch_ratio": 0.42,              // optional structured fields
  "watch_duration": 12.7,
  "position_in_feed": 3,
  "payload": { ... }                // event-specific JSON
}
```

The `events` table stores `watch_ratio`, `watch_duration`,
`position_in_feed`, and the per-surface recommender keys
(`algorithm_feed`, `algorithm_watch` — both populated on every event so
per-surface analysis can join either column without inferring the page
from `event_type`) in promoted columns; everything else lives in the
`payload` JSONB column. Promotion exists so the analytic-hot fields
land on indexes; freeform research data stays flexible in JSONB.

### Batching

| Buffer | Flush condition | Events |
|--------|-----------------|--------|
| Normal | 5 s elapsed _or_ buffer ≥ 20 _or_ on `beforeunload` (sendBeacon) | All non-high-frequency types |
| High-frequency | 2 s elapsed _or_ buffer ≥ 50 _or_ on `beforeunload` | `MOUSE_MOVEMENT`, `SCROLL`, `VIEWPORT_VISIBILITY`, `VIDEO_PROGRESS` |
| Immediate | flushed the moment they enter the buffer | `VIDEO_ENDED`, `LIKE`, `DISLIKE`, `SESSION_END`, `PAGE_EXIT` |

Batching parameters are not user-configurable on purpose — comparability of
historic and future studies depends on the buffer being identical. Treat
them as part of the contract.

### Session lifecycle

Sessions are created on the client (`crypto.randomUUID()` in
sessionStorage), registered via `POST /sessions`, and end either
explicitly via `POST /sessions/{id}/end` or implicitly when no further
events arrive. All events carry the same `session_id` for the lifetime of
that session, which is the join key for behavioural analysis.

## Event types

There are 33 event types in the public schema, partitioned into 9
categories. The "Surface" column lists the surface primitive that emits
the event; "Manual" means the event is only emitted via `useTracking()`
or another bespoke caller and is not part of any surface's automatic set.

### Session lifecycle (2)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `SESSION_START` | EventProvider (mount) | `sessionId`, `startTime`, `referrer`, `initialUrl`, `initialPageType`, `environment` (viewport, screen, userAgent, language, platform, timezone, connection?) |
| `SESSION_END` | EventProvider (`beforeunload`) | `sessionId` |

### Page navigation (3)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `PAGE_LOAD` | Feed/Watch surface | `url`, `pageType` |
| `NAVIGATION` | Feed/Watch surface | `from`, `to`, `pageType`, `dwellTimeMs`, `dwellTimeSec` |
| `PAGE_EXIT` | Feed/Watch surface (unmount) | `url`, `pageType`, `dwellTimeMs`, `dwellTimeSec` |

### Video metadata (1)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `VIDEO_META_CAPTURED` | WatchSurface (per video change) | `videoId`, `title`, `channelName`, `category`, `viewCount`, `description`, `tags`, `duration`, `thumbnailUrl` |

### Playback (8)

All carry `video_id` on the row.

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `VIDEO_PLAY` | VideoSurface (watch) | `currentTime`, `duration`, `playbackRate` |
| `VIDEO_PAUSE` | VideoSurface (watch) | `currentTime`, `duration`, `watchedDuration` |
| `VIDEO_SEEK` | VideoSurface (watch) | `from`, `to`, `seekDistance`, `duration` |
| `VIDEO_ENDED` | VideoSurface (watch) | `duration`, `totalWatchedTime`, `completionRate` (also promoted: `watch_ratio`, `watch_duration`) |
| `VIDEO_PROGRESS` | VideoSurface (watch), every 5 s | `currentTime`, `duration`, `progress` |
| `VIDEO_WATCHED_1S` | VideoSurface (watch), once per src | `currentTime`, `duration`, `progress` (promoted: `watch_duration`, `watch_ratio`) |
| `VIDEO_WATCHED_5S` | VideoSurface (watch), once per src | same as above |
| `VIDEO_BUFFERING` | VideoSurface (watch) | `currentTime`, `readyState`, `networkState` |

### Player controls (3)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `PLAYBACK_RATE_CHANGE` | VideoSurface (watch) | `newRate`, `currentTime` |
| `VOLUME_CHANGE` | VideoSurface (watch) | `volume`, `previousVolume`, `muted`, `previousMuted` |
| `FULLSCREEN_CHANGE` | VideoSurface (watch) | `isFullscreen` |

### Impressions (3)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `HOME_FEED` | FeedSurface (per new chunk) | `videoCount`, `videos[]` (each with `position`, `videoId`, `title`, `channelName?`, `duration?`, `viewCount?`, `thumbnailUrl?`) |
| `RECOMMENDATIONS` | WatchSurface (per related load) | `currentVideoId`, `recommendedCount`, `recommended[]` (same shape as HOME_FEED items) |
| `IMPRESSION` | VideoSurface (card, ≥ 50 % visible, once per mount) | (none beyond `position_in_feed`) |

### User interactions (6)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `FEED_CLICK` | VideoSurface (`context='feed'`) | (none beyond `position_in_feed`) |
| `LIKE` | `useLikes()` | `videoId` (and optional `timestamp` for video clock position) |
| `DISLIKE` | `useLikes()` | `videoId` |
| `VIDEO_CLICK` | VideoSurface (`context='related'`) | `clickedVideoId`, `clickedTitle`, `position`, `fromVideoId`, `context` |
| `THUMBNAIL_HOVER` | VideoSurface (card) | `videoId`, `title`, `position`, `hoverDurationMs`, `followed_by_click`, `context` |
| `KEYBOARD_SHORTCUT` | VideoSurface (watch) | `key`, `action`, `currentTime`, `shiftKey`, `ctrlKey` |

### High-frequency telemetry (3)

| Event | Surface | Notes |
|-------|---------|-------|
| `MOUSE_MOVEMENT` | Feed/Watch surface | `positions[]` sampled at 100 ms, batched 2 s; payload contains `samplingIntervalMs`, `context`, `duration` |
| `SCROLL` | Feed/Watch surface | `scrollY`, `scrollPercent`, `maxScrollPercent`, `pageHeight`; throttled to 500 ms |
| `VIEWPORT_VISIBILITY` | Feed/Watch surface | `visibleItems[]` (each: `videoId`, `position`, `visibilityRatio`, `enterTime`, `exitTime?`), `context`; reported every 3 s |

### Tab/window state (3)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `VISIBILITY_CHANGE` | Feed/Watch surface | `visible`, `visibilityState` |
| `WINDOW_FOCUS` | Feed/Watch surface | (empty) |
| `WINDOW_BLUR` | Feed/Watch surface | (empty) |

### Layout (1)

| Event | Surface | Required `payload` |
|-------|---------|--------------------|
| `LAYOUT_CHANGE` | Manual | `from`, `to`, `context` |

`LAYOUT_CHANGE` is intentionally unsurfaced — it's a UI-author signal for
when the column count or any other UI-side variable shifts mid-session,
and the surfaces don't know about UI-author state.

## Backend consumers

The events table is read by several services. The relevant queries are
documented here so any rename or schema change can audit consumers in
one pass.

| Reader | File | Event types it filters on |
|--------|------|--------------------------|
| Watched-video exclusion (Feed / Watch endpoints) | `backend/app/api/v1/feed.py` | `VIDEO_WATCHED_1S`, `VIDEO_ENDED` |
| Per-experiment view counter | `backend/app/api/v1/events.py` | `VIDEO_PLAY` (popularity sort key — autoplay-included by design) |
| Recommendation evaluation | `backend/app/api/v1/admin/stats.py` | `IMPRESSION`, `FEED_CLICK`, `VIDEO_PLAY`, `VIDEO_ENDED` |
| RecBole training extraction | `backend/app/services/recbole_trainer.py` | `VIDEO_WATCHED_1S` (weight 1.0), `LIKE` (3.0), `VIDEO_ENDED` w/ ratio>0.5 (2.0) |
| Auto I2I (metadata + co-view) | `backend/app/services/item_similarity_computer.py` | any (interaction filtered by `video_id IS NOT NULL`) |
| RecBole CF / I2I freshness check | `backend/app/services/training_scheduler.py` | `VIDEO_WATCHED_1S`, `LIKE`, `VIDEO_ENDED` |
| Trajectory view (admin user status) | `backend/app/api/v1/admin/stats.py` | excludes `MOUSE_MOVEMENT`, `SCROLL`, `VIEWPORT_VISIBILITY`, `VIDEO_PROGRESS`, `VISIBILITY_CHANGE`, `WINDOW_FOCUS`, `WINDOW_BLUR` |

## Backend event-name reads (post-2026-05-06)

The frontend emits the modern playback lifecycle (`VIDEO_PLAY`,
`VIDEO_PAUSE`, `VIDEO_ENDED`, `VIDEO_WATCHED_1S`, `VIDEO_WATCHED_5S`) —
the legacy `VIDEO_START` / `VIDEO_END` names were retired. Backend reads
have been aligned and now use semantically appropriate modern names:

| Reader | File | Event types |
|--------|------|-------------|
| Watched-video exclusion | `backend/app/api/v1/feed.py` | `VIDEO_WATCHED_1S`, `VIDEO_ENDED` |
| Per-experiment view counter | `backend/app/api/v1/events.py` | `VIDEO_PLAY` (popularity sort key — autoplay-included by design) |
| RecBole training extraction | `backend/app/services/recbole_trainer.py` | `VIDEO_WATCHED_1S` (weight 1.0), `LIKE` (3.0), `VIDEO_ENDED` w/ ratio>0.5 (2.0) |
| RecBole CF / I2I freshness | `backend/app/services/training_scheduler.py` | same as training extraction |
| Recommendation evaluation | `backend/app/api/v1/admin/stats.py` | `IMPRESSION`, `FEED_CLICK`, `VIDEO_PLAY`, `VIDEO_ENDED`, (LIKE retained pre-drop) |
| Trajectory view (admin) | `backend/app/api/v1/admin/stats.py` | excludes high-frequency types (`MOUSE_MOVEMENT`, `SCROLL`, etc.) |

**Why `VIDEO_WATCHED_1S` for training rather than `VIDEO_PLAY`**: the
1-second threshold filters autoplay-on-page-load false positives, leaving
only "user actually watched" signal — matching the watched-history
exclusion in `feed.py` for consistency. Use `VIDEO_PLAY` only when the
desired signal includes raw playback starts (e.g., the popularity view
counter, where autoplay-driven counts are intentional).

## Embedded video sources (YouTube, Vimeo, ...)

Platform contract is **`<video>` element-based** playback. The bundled
`<VideoPlayer>` consumes `PlayerHandlers` from a watch-context
`<VideoSurface>` and emits the 12 playback events natively, with
frame-precise timestamps.

Embedded iframe players (YouTube, Vimeo, Twitch, ...) cannot be measured
through the same path: cross-origin policy hides the iframe's playback
state from the host page. The recommended pattern is a **dedicated
adapter component per provider** that consumes the same `PlayerHandlers`
and translates them into the provider's API:

```tsx
<VideoSurface video={video} context="watch">
  {(handlers) =>
    video.resolved_url?.type === 'youtube'
      ? <YouTubeIFramePlayer src={video} {...handlers} />
      : <VideoPlayer src={video.url} {...handlers} />
  }
</VideoSurface>
```

The adapter (`<YouTubeIFramePlayer>` etc.) is **not** a generic
`UniversalPlayer`. We deliberately avoid magic dispatch because the
fidelity differences between native and adapter-derived events are
load-bearing for analysis:

| Aspect | Native (`<VideoPlayer>`) | YouTube IFrame adapter |
|--------|--------------------------|------------------------|
| Timestamp precision | frame-precise (~16 ms) | polling-based (~250–1000 ms) |
| `VIDEO_SEEK` | native `seeked` event | derived from `getCurrentTime()` jumps |
| `VOLUME_CHANGE` | native `volumechange` | polling, may miss intermediate values |
| `KEYBOARD_SHORTCUT` | native window keydown | requires `disablekb=1` and may be lost while iframe holds focus |
| Ad insertion | n/a | YouTube ad time mixes with `watch_duration` unless filtered |
| API stability | local/permanent | YouTube can change embed policy at any time |

For studies requiring fine-grained playback analysis (early-dropout
curves, sub-second seek behavior), prefer mp4 sources. When mixing
sources, **filter by source type before any time-sensitive
aggregation**; the events table's `payload.source` (or video record
metadata) is sufficient for that filter.

Adapters for providers other than YouTube are future work; the platform
ships only the native `<VideoPlayer>` in Phase 1, with the YouTube
adapter scheduled alongside the UI presets in a later phase.

## Adding a new event type

1. Add the literal to `frontend/src/types/event.ts` `EventType` union.
2. If the event needs to be high-frequency, also add the literal to
   `HIGH_FREQ_EVENTS` in `frontend/src/contexts/EventContext.tsx`. If it
   needs immediate flush, add it to `IMMEDIATE_EVENTS`.
3. If the event belongs in a surface, add the emit there and update this
   doc's "Surface" column. If it's an escape-hatch event, document the
   emitter location instead.
4. Update this file's per-category table with the payload contract.
5. Add a backend consumer entry only if a service needs to filter on the
   event; many events are pure logging and don't need server-side reads.

## Adding a new payload field

Promoted columns (`watch_ratio`, `watch_duration`, `position_in_feed`,
`algorithm_feed`, `algorithm_watch`) require an Alembic migration.
Anything else goes inside `payload` and needs only a schema doc update —
JSONB tolerates additions without migration.
