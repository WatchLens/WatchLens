# Adding a UI

WatchLens supports three entry points for authoring a UI. They share
the same data hooks and surface primitives — the choice is about
where the source of truth lives and how it gets compiled.

| Entry point | Source lives in | Compile path | When to use |
|-------------|-----------------|--------------|-------------|
| **Code preset** | `frontend/src/ui-presets/<key>/{feed,watch}.tsx` (git) | Vite build | A UI you want to ship with the platform; needs backend type literal updates. |
| **Admin Code editor** | `ui_templates.code_text` (DB) | sucrase, in-browser | Researcher-authored TSX without build; per-template; survives across sessions. |
| **Admin Visual editor** | `ui_templates.feed_tree` / `watch_tree` (DB JSONB) | `BlockTreeRenderer` walks the tree | Compose 19 blocks visually; eject to TSX when you outgrow the library. See [`editor-block-reference.md`](./editor-block-reference.md). |

The first three quarters of this guide cover the **Code preset** flow.
The last two sections cover the in-browser flows.

> **Per-device routing.** Every user group is bound to one device
> class (`'desktop' | 'tablet' | 'mobile'`), and `ui_config` is flat
> (`{feed: <key>, watch: <key>}`). Built-in presets ship per-device
> variants — `youtube-{desktop,tablet,mobile}`, `tiktok-{desktop,tablet,
> mobile}`, plus the device-agnostic `'none'`. Each value must be a
> built-in whose device list includes the group's device, or a
> published `ui_templates.id` UUID whose `device` matches. A
> participant whose viewport doesn't match the group's device sees a
> forced mismatch notice rather than a scaled-down UI. See
> [`device-routing.md`](./device-routing.md) for the full data model
> and editor flow.

## Architecture in one diagram

```
                ui_config.feed / .watch
                          │
                          ▼
   ┌──────── Feed.tsx / VideoWatch.tsx (dispatchers) ────────┐
   │                                                          │
   │   resolveFeedPreset(ui.feed)  → preset Component         │
   │   resolveWatchPreset(ui.watch) → preset Component        │
   │                                                          │
   └──────────────────────┬──────────────────────────────────-┘
                          │
                          ▼
   ┌─── Preset (e.g. ui-presets/youtube-desktop/feed.tsx) ──┐
   │                                                          │
   │   const { videos } = useFeed()           ← data          │
   │   return (                                               │
   │     <FeedSurface videos={videos}>        ← logging       │
   │       {videos.map(v => (                                 │
   │         <VideoSurface video={v} ...>     ← per-card log  │
   │           <YourCardLayout />             ← visuals       │
   │         </VideoSurface>                                  │
   │       ))}                                                │
   │     </FeedSurface>                                       │
   │   )                                                      │
   └──────────────────────────────────────────────────────────┘
```

The preset only describes layout and visual style. Recommendation
algorithm choice, video source, watched-history exclusion, and the 33
event-schema events are all handled by the layers below.

## Step-by-step

### 1. Decide the preset key

The key is the string that goes in `user_group.ui_config.feed` /
`.watch` for groups assigned to your preset. Built-ins follow the
convention `<preset>-<device>` so each preset/device combination
gets a first-class key (e.g. `youtube-desktop`, `tiktok-mobile`).
Keep additions short and lowercase. Backend `BUILTIN_FEED_KEYS` /
`BUILTIN_WATCH_KEYS` (`schemas/user_group.py`) plus frontend
`BUILTIN_UIS` (`ui-presets/registry.ts`) need matching entries.

### 2. Create the preset folder and components

```
frontend/src/ui-presets/<your-key>/
  feed.tsx
  watch.tsx
```

A minimal feed:

```tsx
// ui-presets/<your-key>/feed.tsx
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'

export default function MyFeed(): JSX.Element {
  const navigate = useNavigate()
  const { videos, hasMore, loadMore, isLoading } = useFeed()

  if (isLoading) return <div>Loading…</div>

  return (
    <FeedSurface videos={videos}>
      <div className="grid grid-cols-3 gap-4 p-6">
        {videos.map((v, i) => (
          <VideoSurface
            key={v.id}
            video={v}
            position={i}
            context="feed"
            onClick={() => navigate(`/watch/${v.video_id}`)}
          >
            <article>
              <img src={v.thumbnail_url ?? ''} alt="" />
              <h3>{v.title}</h3>
              <p>{v.channel_name}</p>
            </article>
          </VideoSurface>
        ))}
      </div>
      {hasMore && <button onClick={loadMore}>Load more</button>}
    </FeedSurface>
  )
}
```

A minimal watch:

```tsx
// ui-presets/<your-key>/watch.tsx
import { useParams } from 'react-router-dom'
import { useVideo, useRelated, useLikes } from '@/ui-runtime/data'
import { WatchSurface, VideoSurface } from '@/ui-runtime/surfaces'
import VideoPlayer from '@/components/video/VideoPlayer'

export default function MyWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const { video } = useVideo(videoId)
  const { videos: related } = useRelated(videoId)
  const likes = useLikes(videoId, { initialCount: video?.like_count })

  if (!video) return <div>Loading…</div>

  return (
    <WatchSurface video={video} relatedVideos={related}>
      <VideoSurface video={video} context="watch">
        {(handlers) => (
          <VideoPlayer src={video.resolved_url?.video_url ?? video.url} {...handlers} />
        )}
      </VideoSurface>

      <h1>{video.title}</h1>
      <button onClick={likes.like}>{likes.isLiked ? '👍' : 'Like'}</button>
      <button onClick={likes.dislike}>{likes.isDisliked ? '👎' : 'Dislike'}</button>

      {related.map((rv, i) => (
        <VideoSurface key={rv.id} video={rv} position={i} context="related">
          <a href={`/watch/${rv.video_id}`}>{rv.title}</a>
        </VideoSurface>
      ))}
    </WatchSurface>
  )
}
```

That's a full UI. The 33-event schema is enforced automatically.

### 3. Register the preset

Add an import + entry in `ui-presets/registry.ts`:

```tsx
import MyFeed from './<your-key>/feed'
import MyWatch from './<your-key>/watch'

export const FEED_PRESETS = {
  // … existing …
  '<your-key>': {
    Component: MyFeed,
    meta: { label: 'My UI', format: 'longform', description: '…' },
  },
}
export const WATCH_PRESETS = {
  // … existing …
  '<your-key>': {
    Component: MyWatch,
    meta: { label: 'My UI', format: 'longform', description: '…' },
  },
}
```

### 4. Update the type literal

Add `'<your-key>'` to `UIStyle` in `frontend/src/types/experiment.ts`
and the matching `Literal` in `backend/app/schemas/user_group.py`. Both
sides must agree — TypeScript catches frontend drift, Pydantic catches
backend.

### 5. Try it

Create a user group with `ui_config.feed = '<your-key>'`, log in as a
user in that group, and visit `/`. The dispatcher routes to your preset
automatically; events flow into the `events` table without any extra
work.

## Available hooks (data)

All hooks live in `@/ui-runtime/data`:

| Hook | Returns | Notes |
|------|---------|-------|
| `useFeed(opts?)` | `{ videos, hasMore, loadMore, exhausted, isLoading, … }` | Paginated. `useFeed({ limit: 40 })` to set page size. |
| `useVideo(id)` | `{ video, isLoading, error }` | Single fetch by external id. |
| `useRelated(id, opts?)` | `{ videos, algorithm, isLoading }` | Related list for the watch page. |
| `useComments(id, opts?)` | `{ comments, total, hasMore, loadMore, … }` | Top-level comments. |
| `useReplies(videoId, commentId, opts?)` | `{ replies, hasMore, loadMore, … }` | Replies under a comment. |
| `useLikes(id, opts?)` | `{ liked, isLiked, isDisliked, count, like, dislike }` | Local like state + LIKE/DISLIKE event emit. |
| `useUser()` | `{ login_id, user_id, user_group_id, ui_config, algorithm_config, … }` | The current user. UI is read-only here. |
| `useTracking()` | `{ trackEvent, flushEvents, sessionId }` | Manual emit — use only when surfaces don't already cover the event you need. |

Do **not** call `axios` or the API client directly. The hooks are
load-bearing because some emit events as a side effect (`useLikes`).
Bypassing them silently breaks the schema.

## Available surfaces (logging)

All surfaces live in `@/ui-runtime/surfaces`:

| Surface | Mounts | Emits |
|---------|--------|-------|
| `<FeedSurface videos={...}>` | once at the feed page root | PAGE_LOAD/EXIT, NAVIGATION, SCROLL, MOUSE_MOVEMENT, VIEWPORT_VISIBILITY, VISIBILITY_CHANGE, WINDOW_FOCUS/BLUR, HOME_FEED |
| `<WatchSurface video={video} relatedVideos={...}>` | once at the watch page root | PAGE_LOAD/EXIT, NAVIGATION, SCROLL, MOUSE_MOVEMENT, VIEWPORT_VISIBILITY, VISIBILITY_CHANGE, WINDOW_FOCUS/BLUR, VIDEO_META_CAPTURED, RECOMMENDATIONS |
| `<VideoSurface video={video} position={i} context="feed">` | per feed card | IMPRESSION, THUMBNAIL_HOVER, FEED_CLICK |
| `<VideoSurface video={video} position={i} context="related">` | per related card | IMPRESSION, THUMBNAIL_HOVER, VIDEO_CLICK |
| `<VideoSurface video={video} context="watch">` | once around the player; render-prop child receives `PlayerHandlers` | VIDEO_PLAY/PAUSE/SEEK/ENDED/PROGRESS/WATCHED_1S/5S/BUFFERING, PLAYBACK_RATE_CHANGE, VOLUME_CHANGE, FULLSCREEN_CHANGE, KEYBOARD_SHORTCUT |

The full payload spec is in [`event-schema.md`](./event-schema.md).

## Available bundled UI elements

These are not part of the contract; they're convenient building blocks:

- `@/components/video/VideoPlayer` — `<video>`-based player with native
  playback events. Pair with `<VideoSurface context="watch">`.
- `@/components/video/VideoCard` — thumbnail + title + meta layout used
  by `youtube-desktop` and the legacy 9:16 grid presets. Reuse or roll
  your own.
- `@/components/video/CommentSection` — toggleable comment thread; reads
  via `useComments` / `useReplies` internally.

You're free to ignore any of them and write yours from scratch. The
surfaces don't care about the layout; they only care that they wrap
data-bound DOM.

## Limitations

### YouTube/Vimeo embeds

The bundled `<VideoPlayer>` is `<video>`-based and won't render YouTube
embeds. Either:

1. Use mp4 datasets only, or
2. Add a per-provider adapter component (e.g.
   `<YouTubeIFramePlayer>`) that consumes the same `PlayerHandlers`
   from `<VideoSurface>` and translates them into the embed's API.

The platform doesn't ship a YouTube adapter today; see
[`event-schema.md` § Embedded video sources](./event-schema.md#embedded-video-sources-youtube-vimeo-)
for the fidelity tradeoffs and the recommended pattern.

### Pager-style watch views

A pager that swaps the active video without remounting (e.g. TikTok's
vertical scroll) doesn't currently lift the active video into
`<WatchSurface>`'s prop. VIDEO_META_CAPTURED stays bound to the
URL-pinned starting video; per-card playback events fire correctly via
the active card's own player but VIDEO_META_CAPTURED on swipe is a
known gap.

### Manual emits

`LAYOUT_CHANGE` is emitted only via `useTracking()` — surfaces don't
know when an in-page layout switch is "user intent". No bundled preset
emits it today; the schema entry is reserved for code-track presets
that expose a column-count toggle or similar in-page layout control.

## Testing your preset

Browser-side: bring up the stack, log in as a user assigned to your
preset group, and walk the standard interaction set (feed scroll,
hover, click, watch, play, pause, seek, like, comment). Inspect with:

```sql
SELECT event_type, COUNT(*)
FROM events e
JOIN sessions s ON e.session_id = s.id
JOIN users u ON s.user_id = u.id
WHERE u.login_id = '<your test user>'
GROUP BY event_type
ORDER BY event_type;
```

Twenty-eight or more distinct event types is the typical "preset works"
threshold for a single-user walkthrough.

## Reference presets

The bundled presets in `frontend/src/ui-presets/` (one directory per
device variant):

- `youtube-desktop/` — 4-column 16:9 grid + aspect-video player +
  400px sidebar. Hand-written React with infinite scroll, timeAgo,
  hover scale. Cleanest reference for the React-first preset flow.
- `youtube-tablet/`, `youtube-mobile/` — thin
  `<BlockTreeRenderer page="..." tree={getDefault*Tree('<device>')} />`
  wrappers. Defer layout to the editor's default tree, so any visual
  edits to that tree's shape automatically reach the wrapper preset.
- `tiktok-desktop/` — split-screen 9:16 watch with right-rail meta /
  comments / related; full React.
- `tiktok-mobile/` — full-screen 9:16 vertical pager with right action
  stack and bottom-sheet comments; full React.
- `tiktok-tablet/` — `<BlockTreeRenderer>` wrapper (same pattern as
  the YouTube tablet/mobile wrappers).

Built-in dispatch lives in `pages/user/Feed.tsx` /
`pages/user/VideoWatch.tsx`: `isBuiltinFeedKey(key)` →
`FEED_PRESETS[key].Component` for any of the keys above; otherwise the
dispatcher hands the UUID to `<TemplateFeed>` /
`<TemplateWatch>` for admin-authored templates. There is no separate
`custom/` preset — it was retired when `ui_config` collapsed to flat
keys (alembic 019).

## Admin Code editor (in-browser TSX)

Admins can author a per-template UI without committing it to git. The
editor compiles TSX in-browser via sucrase: paste / write a default-
exported component, switch the editor's preview pane, see it run live.

```tsx
// pasted into the admin Code editor
import { useFeed } from '@watchlens/data'
import { FeedSurface, VideoSurface } from '@watchlens/surfaces'

export default function MyCustomFeed(): JSX.Element {
  const { videos, isLoading } = useFeed({ limit: 12 })
  if (isLoading) return <div>Loading…</div>
  return (
    <FeedSurface videos={videos}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: 16 }}>
        {videos.map((v, i) => (
          <VideoSurface key={v.id} video={v} position={i} context="feed">
            <article>
              <div style={{ aspectRatio: '16/9', background: '#eee', borderRadius: 8 }} />
              <h3>{v.title}</h3>
            </article>
          </VideoSurface>
        ))}
      </div>
    </FeedSurface>
  )
}
```

Resolved imports (compile-time rewritten by `frontend/src/ui-runtime/compile.ts`):

| Import | Resolves to |
|--------|-------------|
| `'@watchlens/data'` | `window.__watchlens__.data` (the data hooks) |
| `'@watchlens/surfaces'` | `window.__watchlens__.surfaces` |
| `'@watchlens/blocks'` | `window.__watchlens__.blocks` (block runtime + `BlockTreeRenderer`) |
| `'@watchlens/runtime'` | `window.__watchlens__` (everything) |
| `'react'` | `window.__watchlens__.React` |

Anything else throws at compile time so the missing import is visible
in the editor before it can break a participant session.

The same code editor renders both feed and watch dispatchers — the
admin's TSX is responsible for branching on URL or page context if it
needs page-specific behaviour. The Phase 5 visual-eject path (below)
generates this branch automatically.

To assign a code-editor template to a group, set
`ui_config.template_id` on the group to the template's UUID. The
dispatcher (`ui-presets/custom/feed.tsx` / `watch.tsx`) reads that id,
fetches the template, and routes to `<CompiledUI>` when
`template_type = 'code'`.

## Admin Visual editor (block tree)

The Visual editor composes a UI from 19 blocks (Page, Stack/Group,
Grid, SplitColumn, VideoList, VideoPlayer, Thumbnail, ChannelAvatar,
VideoTitle, VideoChannel, VideoViews, VideoLikes, VideoDuration,
VideoDescription, VideoTags, VideoActions, CommentList, Tabs, Spacer).
The full reference, including props and composition recipes, is in
[`editor-block-reference.md`](./editor-block-reference.md).

The block tree is stored as JSONB on `ui_templates.feed_tree` and
`watch_tree`. The dispatcher (`ui-presets/custom/`) renders it via
`<BlockTreeRenderer>` when `template_type = 'tree'`.

### Eject to Code

Any visual template can be ejected into the Code editor at any time.
The editor's right panel shows the live-generated TSX (read-only) for
the current trees:

```tsx
import { BlockTreeRenderer } from '@watchlens/blocks'
import type { BlockNode } from '@watchlens/blocks'

const FEED_TREE: BlockNode = { /* full feed tree literal */ }
const WATCH_TREE: BlockNode = { /* full watch tree literal */ }

export default function CustomTemplate(): JSX.Element {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isWatch = pathname.startsWith('/watch')
  return (
    <BlockTreeRenderer
      page={isWatch ? 'watch' : 'feed'}
      tree={isWatch ? WATCH_TREE : FEED_TREE}
    />
  )
}
```

Three buttons in the panel:

- **Copy** — clipboard.
- **Export** — downloads as `<slug>.tsx`. Drop into
  `frontend/src/ui-presets/<key>/feed.tsx` or paste into another admin
  Code editor.
- **Eject →** — confirms, then copies the generated TSX into the
  editor's Code mode and switches modes. Save to commit
  `template_type = 'code'`; the original block trees stay in the DB
  (un-NULLed) so manual SQL `UPDATE template_type = 'tree'` reverts.

The generated form is a thin wrapper around `BlockTreeRenderer` rather
than a per-block JSX expansion. That keeps the eject path simple and
the runtime semantics identical, at the cost of human-friendliness if
the TSX is meant to be hand-edited extensively. Replace the
`<BlockTreeRenderer>` call with raw JSX (using the same data hooks +
surfaces shown earlier in this doc) when the wrapper is no longer
expressive enough.
