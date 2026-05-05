# Editor block reference

The Visual editor (`/admin/ui-custom/<id>` → Visual mode) composes a UI
out of **block trees**. A block is a typed node with `props`, optional
`children`, and optional named `slots`. `BlockTreeRenderer` walks the
tree, looks each node up in a registry, and renders it through a small
React component that applies the props.

This document is the reference for the block library and the editor UX.
For the underlying event measurement that fires regardless of how the
tree was authored, see [`event-schema.md`](./event-schema.md).

## Overview

```
                feed_tree   /   watch_tree    (JSONB columns on ui_templates)
                          │
                          ▼
              ┌─── BlockTreeRenderer ───┐
              │  page = 'feed'/'watch'  │   mounts FeedSurface or WatchSurface
              │                          │   pre-fetches feed / related / video
              │  walk(tree):             │   threads RenderEnv (page, pageVideo,
              │    spec = lookup(type)   │     iter, navigateToVideo, ...)
              │    <spec.Component       │   slots = named child arrays (e.g.
              │       node env            │     SplitColumn { main, sidebar };
              │       renderChildren     │     VideoList { item }; Tabs { <tabId> })
              │       renderSlot/>       │
              └──────────────────────────┘
```

Atoms (Title / Channel / Views / …) read the active video out of
`RenderEnv`: inside a `VideoList` iteration the iterator pushes
`env.iter.video`, otherwise `env.pageVideo` (watch page) takes over. No
prop wiring is required — drop a `VideoTitle` anywhere inside a
`VideoList` slot and it reads the iteration's video; drop the same
`VideoTitle` outside any iteration on a watch page and it reads the
URL-pinned video.

## The library at a glance

| Block | Display | Category | Purpose |
|-------|---------|----------|---------|
| `Page` | Page | Layout | Tree root. Applies background, padding, optional max-width. |
| `Stack` | Group | Layout | Vertical flex stack. Use **Grid** for horizontal arrangements. |
| `Grid` | Grid | Layout | CSS grid container. Equal columns or arbitrary `columnsTemplate`. |
| `SplitColumn` | Two Columns | Layout | Main + sidebar slot pair (watch-page main / sidebar). |
| `Spacer` | Spacer | Layout | Fixed gap when `Stack.gap` isn't fine-grained enough. |
| `Tabs` | Tabs | Layout | Tab bar with one slot per tab id. |
| `VideoList` | Video List | Media | Iterates feed or related videos. Grid or list layout. |
| `VideoPlayer` | Player | Media | Inline `<video>` element (watch page only). |
| `Thumbnail` | Thumbnail | Media | Bound video thumbnail with optional duration badge. |
| `ChannelAvatar` | Channel Avatar | Media | Letter-circle avatar (color hashed from channel name). |
| `VideoActions` | Like/Dislike Buttons | Media | Interactive Like / Dislike (emits `LIKE` / `DISLIKE`). |
| `CommentList` | Comments | Media | Comment thread (uses `useComments`/`useReplies`). |
| `VideoTitle` | Title | Text | Bound title with optional line clamp. |
| `VideoChannel` | Channel Name | Text | Bound channel name with optional `@`-prefix handle. |
| `VideoViews` | View Count | Text | Bound view count (1.2K, 3.4M, …). |
| `VideoLikes` | Like Count | Text | Read-only like count with optional heart icon. |
| `VideoDuration` | Duration | Text | Bound duration as mm:ss / hh:mm:ss. |
| `VideoDescription` | Description | Text | Bound description with optional line clamp + expand toggle. |
| `VideoTags` | Tags | Text | Bound tags rendered as `#hashtag` spans. |

Categories drive the palette grouping. The internal `type` value in the
JSON tree never changes; the **Display** name is the label rendered in
the editor UI.

## Layout blocks

### Page

Tree root. Required as the outermost node — every other block lives
inside its `children` array (or inside slots of descendants).

| Prop | Type | Notes |
|------|------|-------|
| `background` | color | Applied to the full-height page body. |
| `padding` | spacing | Shorthand: `'24px'` or `'8px 16px'`. |
| `maxWidth` | size | Optional. When set, the inner content is centered with `margin: 0 auto`. |

### Stack (Group)

Vertical flex stack of children. The block has **no `direction` prop** —
horizontal arrangements use `Grid` with a column template (e.g.
`'auto 1fr'`). One block, one job: stack things vertically OR pick Grid
for columns.

| Prop | Type | Notes |
|------|------|-------|
| `gap` | size | Gap between children. |
| `align` | alignment | `start` / `center` / `end` / `stretch` (cross-axis). |
| `justify` | select | `start` / `center` / `end` / `space-between` / `space-around`. |
| `background` | color | Container background. Empty = transparent. |
| `padding` | spacing | `'16px'` or `'8px 16px'`. Empty = no padding. |
| `borderRadius` | size | Empty = sharp corners. |

### Grid

CSS grid container. Children flow left-to-right, then wrap. Two prop
shapes:

- `columns` (number 1–12) → equal-width columns via `repeat(N, 1fr)`.
- `columnsTemplate` (string) → arbitrary template, e.g. `'auto 1fr'`,
  `'168px 1fr'`. When set, overrides `columns`.

| Prop | Type | Notes |
|------|------|-------|
| `columns` | number | Equal columns count. Ignored when `columnsTemplate` is non-empty. |
| `columnsTemplate` | text | Raw `grid-template-columns` value. |
| `gap` | size | |
| `background` | color | Container background. Empty = transparent. |
| `padding` | spacing | `'16px'` or `'8px 16px'`. Empty = no padding. |
| `borderRadius` | size | Empty = sharp corners. |

### SplitColumn (Two Columns)

Two named slots (`main` + `sidebar`) — the standard watch-page split.

| Prop | Type | Notes |
|------|------|-------|
| `sidebarPosition` | select | `left` / `right` / `hidden`. `hidden` collapses to a single full-width main. |
| `sidebarWidth` | size | Fixed pixel/em width of the sidebar slot. |
| `gap` | size | |

Slots: `main`, `sidebar`. The editor labels them "Main column" and
"Sidebar".

### Spacer

Fixed-size gap. Useful when a `Stack`'s uniform `gap` is too coarse.

| Prop | Type | Notes |
|------|------|-------|
| `size` | size | Both height and width are set; only one matters in a vertical stack. |

### Tabs

Tab bar with one slot per tab id. The selected tab's slot is rendered;
the rest stay mounted-but-hidden. Local state owns the active tab.

| Prop | Type | Notes |
|------|------|-------|
| `tabs` | `{ id, label }[]` | Tab bar definition. The slot name on the node must match each tab `id`. |
| `initialTab` | text | Tab id to start on. Falls back to the first tab. |

The `tabs` prop has **no UI widget yet** — it's authored as raw JSON in
the Code panel until a structured editor lands. The block is fully
runtime-functional.

## Media blocks

### VideoList

Iterates the page's videos. The data source is automatic:

- Feed page → uses `env.feedVideos` (the platform's recommendation).
- Watch page → uses `env.relatedVideos` (related to the URL-pinned video).

| Prop | Type | Notes |
|------|------|-------|
| `layout` | `'grid' \| 'list'` | Switch widget. `grid` = N-column CSS grid; `list` = single-column horizontal cards. Switching swaps the slot template (see "Layout switch" below). |
| `columns` | number | Only visible when `layout = grid`. |
| `gap` | size | |
| `maxItems` | number | `0` = render all videos; otherwise slice. |

**Slot:** `item` — the per-card template. Each iteration renders a
`<VideoSurface>` (per-card events) wrapping the slot's children with
`env.iter` set to the current video.

**Layout switch.** When the admin toggles `layout`, the editor replaces
`slot.item` with a sensible default for that layout — a vertical Stack
(`gridCardTemplate`) or a horizontal Grid (`listCardTemplate`). Any
prior edits to the slot are discarded; the switch is a "starter
template chooser", not a one-way lock. Edit the new template
afterwards.

### VideoPlayer (Player)

Inline `<video>` player. Reads the bound video from `env.iter.video` or
`env.pageVideo`. **Only valid on a watch page.** Wraps the player with a
watch-context `VideoSurface`, so the full playback event family
(`VIDEO_PLAY` / `PAUSE` / `SEEK` / `ENDED` / `PROGRESS` /
`WATCHED_1S` / `WATCHED_5S` / `BUFFERING`, plus `PLAYBACK_RATE_CHANGE`,
`VOLUME_CHANGE`, `FULLSCREEN_CHANGE`, `KEYBOARD_SHORTCUT`) is emitted
without per-author wiring.

| Prop | Type | Notes |
|------|------|-------|
| `aspect` | aspect ratio | `'16/9'`, `'9/16'`, custom. |

### Thumbnail

Bound thumbnail with extension fallback (`jpg` → `png` → `webp` for
extensionless paths) and a duration badge overlay.

| Prop | Type | Notes |
|------|------|-------|
| `aspect` | aspect | |
| `borderRadius` | size | |
| `showDuration` | toggle | Render a duration badge over the thumbnail. |
| `durationPosition` | select | `bottom-right` / `bottom-left` / `top-right` / `top-left`. |

### ChannelAvatar

Letter-circle avatar (color hashed from channel name). Compose alongside
`VideoChannel` (in a Grid with `columnsTemplate: 'auto 1fr'`) for an
avatar+name handle row.

| Prop | Type | Notes |
|------|------|-------|
| `size` | number | Pixel diameter (16–96). |
| `shape` | select | `circle` / `square`. |
| `fontSize` | size | Letter font size. Defaults to 40% of `size`. |

### VideoActions

Interactive Like / Dislike buttons. Uses `useLikes(videoId)` so toggles
emit `LIKE` / `DISLIKE` automatically.

| Prop | Type | Notes |
|------|------|-------|
| `showLike` | toggle | |
| `showDislike` | toggle | |
| `background` | color | Pill container background. Empty = Tailwind `bg-gray-100` default. |
| `color` | color | Text + heart-icon color in inactive state. Empty = Tailwind `text-gray-700`. |
| `activeColor` | color | Color when liked / disliked. Empty = Tailwind `text-blue-600`. |

### CommentList

Comment thread for the bound video. Reads via `useComments` /
`useReplies` (top-level + replies) internally.

| Prop | Type | Notes |
|------|------|-------|
| `defaultExpanded` | toggle | Render the thread expanded on mount. |

## Text blocks (atoms)

All atoms read the active video out of `RenderEnv` (`env.iter.video` if
inside an iteration, otherwise `env.pageVideo`). They return `null` if
no video is bound — this is the correct behaviour outside the iteration
on a feed page.

### VideoTitle

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `fontWeight` | select | `400` / `500` / `600` / `700`. |
| `color` | color | |
| `lines` | number | Line clamp (1–5). |

### VideoChannel

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `color` | color | |
| `prefix` | text | Prepended to the channel name. `'@'` lowercases + replaces spaces with `_` (TikTok-style handle). |

### VideoViews

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `color` | color | |

Renders formatted view count (e.g. `1.2K views`, `3.4M views`).

### VideoLikes

Read-only like count. For interactive Like buttons see `VideoActions`.

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `color` | color | |
| `showHeart` | toggle | Render a heart icon prefix. |

### VideoDuration

Renders `mm:ss` (or `hh:mm:ss` for >1h). Returns `null` if the bound
video has no duration.

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `color` | color | |

### VideoDescription

| Prop | Type | Notes |
|------|------|-------|
| `lineClamp` | number | Lines before truncation (1–20). |
| `expandable` | toggle | When true, renders an expand toggle (`...Show more` / `Show less`). |
| `fontSize` | size | |
| `color` | color | Text color. |
| `background` | color | Wrapper background — only applies when `expandable=true`. Empty = Tailwind `bg-gray-100`. |

### VideoTags

| Prop | Type | Notes |
|------|------|-------|
| `fontSize` | size | |
| `color` | color | |

## Editor UX

### Tree editor (left panel)

A flat accordion. Every block in the tree renders as one row; clicking
the row selects it and expands a property editor inline. Re-clicking
the selected row deselects (closes the inline panel).

Hierarchy is conveyed by:
- **Top-level rows** (Page, top-level VideoList) sit flush at the
  highest level.
- **Slot headers** (gray, `↳`-prefixed) appear above each named slot
  (Main column / Sidebar / per-tab panels). Click `+` on a slot to
  insert a child.
- **Card group rows** are synthetic rows for `VideoList.item` — clicking
  one expands the card composition below it (with a "↓ inside the card"
  divider) and zooms the preview into a single mock card. Click again
  to collapse.

Drag-drop:
- Drag a block row onto another block to nest it as a child.
- Drag onto a slot header to drop into that slot.
- The root (Page) cannot be dragged or deleted.
- Inside a card group, the slot's first child (the card root) cannot be
  deleted (× disabled) — emptying the slot would break iteration.

### Preview panel (center)

Two modes, switched implicitly by selection:

1. **Full preview** (default) — renders the tree exactly as production
   via `<BlockTreeRenderer mock>`, using the bundled mock dataset.
2. **Card focus** — when the selected node lives inside a
   `VideoList.item` slot, the panel zooms in on a single mock card. The
   admin can edit individual atoms close-up; the full grid reappears
   when a node outside the card is selected (e.g. the Page row).

Selecting a row outlines the corresponding rendered region with an
inset blue outline. Clicking any rendered block in the preview walks
the DOM up to find the nearest `data-block-id` and selects that row in
the tree — selection works in both directions.

### Generated TSX (right panel)

The right panel shows the live-generated TSX for the current trees
(both feed and watch, with a `pathname.startsWith('/watch')` branch).
Buttons:

- **Copy** — clipboard.
- **Export** — downloads as `<template-name>.tsx`. Drop into
  `frontend/src/ui-presets/<key>/feed.tsx` or paste into the admin
  Code editor.
- **Eject →** — confirms, then copies the generated TSX into the
  editor's Code mode and switches modes. The block trees stay in the
  database (not destroyed) but the editor's source-of-truth is now
  Code mode. Reversible only by manually flipping `template_type`
  back to `'tree'` via SQL.

The Custom CSS textarea below is a raw escape hatch saved to
`feed_css` / `watch_css`, scoped to `.ui-custom-template` in the
production dispatcher.

## Composition recipes

### YouTube-style feed card (vertical, atom composition)

```
VideoList(layout=grid, columns=4, gap=16px)
  slot.item:
    Stack(gap=8px)
      Thumbnail(aspect=16/9, showDuration=true, borderRadius=12px)
      Grid(columnsTemplate='auto 1fr', gap=8px)
        ChannelAvatar(size=36, shape=circle)
        Stack(gap=2px)
          VideoTitle(fontSize=14px, lines=2)
          VideoChannel(fontSize=12px, color=#606060)
          VideoViews(fontSize=12px, color=#606060)
```

### YouTube-style sidebar card (horizontal)

```
VideoList(layout=list, gap=12px)
  slot.item:
    Grid(columnsTemplate='168px 1fr', gap=8px)
      Thumbnail(aspect=16/9, borderRadius=8px)
      Stack(gap=2px)
        VideoTitle(...)
        VideoChannel(...)
        VideoViews(...)
```

### YouTube-style watch page

```
Page(background=#fff, padding=24px, maxWidth=1800px)
  SplitColumn(sidebarPosition=right, sidebarWidth=400px, gap=24px)
    slot.main:
      Stack(gap=12px)
        VideoPlayer(aspect=16/9)
        VideoTitle(fontSize=20px, fontWeight=600)
        Grid(columnsTemplate='1fr auto', gap=16px)
          VideoViews(fontSize=14px)
          VideoActions(showLike, showDislike)
        Grid(columnsTemplate='auto 1fr', gap=8px)
          ChannelAvatar(size=32)
          VideoChannel(fontSize=14px)
        VideoDescription(lineClamp=3, expandable=true)
        CommentList(defaultExpanded=true)
    slot.sidebar:
      VideoList(layout=list)
        slot.item:  (sidebar card; same shape as the recipe above)
```

The bundled `BlockTreeDemo` template (`/admin/ui-custom/11111111-2222-3333-4444-555555555555`)
is built from these recipes — load it as a starting reference.

## Known gaps

- **`Tabs.tabs` widget**: structured array prop, edited as raw JSON in
  the Code panel until a per-tab editor ships.
- **Layer / Overlay block**: there's no block for absolute-positioned
  overlay (e.g. caption-on-thumbnail). Layouts that require it (the
  TikTok feed's caption-over-thumbnail) currently degrade to
  "caption-below-thumbnail" via the regular Stack.
- **Page `color` prop**: missing. Text on dark backgrounds requires
  per-atom `color` overrides.
- **Shorts watch**: kept as the legacy `<ShortsWatch>` component (not
  yet re-encoded as a tree). Use the Code track preset for now.

These are tracked in the project plan as Phase 4 polish; the current
library covers the YouTube-classic feed, YouTube-classic watch, the
TikTok-style 9:16 feed, and the TikTok-style watch with the meta-below
fallback.
