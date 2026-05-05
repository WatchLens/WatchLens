# Per-device UI routing

WatchLens treats **device** as an experimental treatment knob. Every
user group is bound to exactly one device class (`desktop` / `tablet` /
`mobile`); a participant whose viewport doesn't match the group's
device gets a forced notice page rather than a silently-scaled UI.
Built-in presets are tagged per device too — `youtube-desktop`,
`youtube-tablet`, `youtube-mobile`, `tiktok-desktop`, `tiktok-tablet`,
`tiktok-mobile`, plus the device-agnostic `none`. Admin-authored UI
templates (visual or code track) carry one device tag and are only
selectable on groups whose device matches.

The asymmetry that this enforces — one named treatment renders the same
DOM and emits the same events for every participant in the group — is
the experimental control the architecture exists for.

For block-level reference (props, slots, recipes) see
[`editor-block-reference.md`](./editor-block-reference.md).

## Architecture

```
   ui_templates                user_groups
   ┌──────────────────┐        ┌──────────────────────────────┐
   │ id, name, …      │        │ id, name, …                  │
   │ template_type    │  ◄─── ┤ device  'desktop' | 'tablet'  │
   │   'tree'/'code'  │        │         | 'mobile'           │
   │ device           │        │ ui_config { feed: <key>,     │
   │   'desktop' /    │        │             watch: <key> }   │
   │   'tablet' /     │        │ algorithm_config             │
   │   'mobile'       │        └──────────────────────────────┘
   │ feed_tree, …     │                       │
   └──────────────────┘                       ▼
                              ┌──────────────────────────────┐
                              │ pages/user/Feed.tsx          │
                              │ pages/user/VideoWatch.tsx    │
                              │   detected = useDevice()     │
                              │   if (group.device !=        │
                              │        detected)             │
                              │     return MismatchNotice    │
                              │   else dispatch ui[surface]  │
                              └──────────────────────────────┘
```

Three breakpoints (Tailwind standard) decide the device class:

| Width | Device |
|-------|--------|
| `< 768px` | mobile |
| `< 1024px` | tablet |
| `≥ 1024px` | desktop |

`useDevice()` watches `window.innerWidth`, so a resize / rotation that
crosses a breakpoint flips the dispatcher to the matching preset
without a page reload — but if the new viewport doesn't match the
group's `device`, the participant lands on the mismatch notice.

## Data model

### `user_groups.device`

Each group carries one device tag. Set at create-time; mutable on
`draft` experiments, locked on `active` ones (along with `ui_config`)
to prevent layout-driven confounds mid-study.

### `user_groups.ui_config`

Flat per-surface routing:

```json
{ "feed": "youtube-desktop", "watch": "youtube-desktop" }
```

Each value is either a built-in key (table below) or a published
`ui_templates.id` UUID whose `device` matches the group's `device`.
The validator (`schemas/user_group.py:_validate_ui_key`) rejects every
other combination.

### `ui_templates.device`

Each template targets exactly one device. The editor preview locks to
that device's design width (1280 / 768 / 375 px) and seeds the trees
with the matching default; switching the tag swaps the trees to the
new device's defaults.

## Built-in preset matrix

| Key | Surface | Devices | Implementation |
|-----|---------|---------|----------------|
| `youtube-desktop` | feed + watch | `desktop` | React (4-col grid, infinite scroll, timeAgo, sidebar) |
| `youtube-tablet` | feed + watch | `tablet` | `BlockTreeRenderer` + `getDefault*Tree('tablet')` |
| `youtube-mobile` | feed + watch | `mobile` | `BlockTreeRenderer` + `getDefault*Tree('mobile')` |
| `tiktok-desktop` | feed + watch | `desktop` | React (9:16 grid + split-screen pager watch) |
| `tiktok-tablet` | feed + watch | `tablet` | `BlockTreeRenderer` |
| `tiktok-mobile` | feed + watch | `mobile` | React (9:16 vertical full-screen pager + bottom-sheet comments) |
| `none` | feed only | `desktop` + `tablet` + `mobile` | Dispatcher redirect (no UI) |

`'none'` is device-agnostic because it renders no UI at all (the
dispatcher just navigates to the first watchable video). All other
built-ins target one device — researchers wanting a desktop-style
layout on mobile must author a `device='mobile'` template, since
"silently scale a desktop UI" is the failure mode this architecture
exists to eliminate.

The frontend / backend agree on this mapping:

```typescript
// frontend: src/ui-presets/registry.ts
BUILTIN_UIS: UIPresetInfo[]  // 7 entries with `devices: Device[]`

// backend: app/schemas/user_group.py
BUILTIN_FEED_KEYS: dict[str, set[str]]   // 7 keys (incl. 'none')
BUILTIN_WATCH_KEYS: dict[str, set[str]]  // 6 keys (no 'none')
```

## Dispatcher

`pages/user/Feed.tsx` (and `VideoWatch.tsx` likewise):

```tsx
const detected = useDevice()
if (user.device && user.device !== detected) {
  return <DeviceMismatchNotice expected={user.device} detected={detected} />
}
const key = ui.feed
if (key === 'none') return <FeedNoneRedirect />
if (isBuiltinFeedKey(key)) return <FEED_PRESETS[key].Component />
return <TemplateFeed templateId={key} />
```

The mismatch notice is forced — there is no "Continue anyway" button,
because every fallback shifts the rendered UI off the named treatment.
A participant on the wrong device must switch.

## Editor flow

### Create

`Admin → UI Custom → New Template` exposes a Device radio
(Desktop / Tablet / Mobile). The editor opens at that device's preview
width and seeds the trees with the matching default:

| Device | Feed default | Watch default |
|--------|--------------|---------------|
| desktop | 4-column grid + sidebar of related cards | `SplitColumn` (16:9 player + 400px sidebar) |
| tablet | 2-column grid (matches the YouTube iPad layout) | `SplitColumn` (player + 280px sidebar) |
| mobile | Single-column list (full-width 16:9 cards) | No sidebar — player → meta → comments → related list |

### Switch device

Editor toolbar's Device picker re-tags the open template. Tree shapes
that work on a 1280px desktop don't work on a 375px mobile, so
switching swaps the trees to the new device's defaults. Unsaved
changes prompt before discarding — there is no "keep my edits across
devices" mode (that would re-introduce the silent-scaling failure
mode).

### Assign to a group

`Admin → Experiments → <id> → Groups → Edit algorithm → UI Config`
opens a 2-slot picker (one feed, one watch). The available options are
filtered to the group's device:

```
Feed Page                              Watch Page
  [ YouTube (Desktop) | TikTok (Desktop) | … ]   [ YouTube (Desktop) | TikTok (Desktop) ]
```

Tablet and mobile groups see only the matching `youtube-tablet` /
`tiktok-tablet` / etc. variants plus `'none'` (which is on every
device). Admin-authored templates appear alongside if their `device`
column matches.

## Mock data in the editor

Both Visual mode (`<BlockTreeRenderer mock>`) and Code mode
(`<CompiledUI mock>`) render against bundled mock data
(`MOCK_FEED_VIDEOS` / `MOCK_RELATED_VIDEOS` / `MOCK_PAGE_VIDEO` /
`MOCK_COMMENTS`) so the editor preview works regardless of whether the
admin is assigned to a user group. Production renders never opt into
mock — `<TemplateFeed>` and `<TemplateWatch>` mount `<CompiledUI>` and
`<BlockTreeRenderer>` without the `mock` prop.

The mock is provided through `MockDataContext`. Data hooks
(`useFeed` / `useVideo` / `useRelated` / `useComments`) check this
context and short-circuit before hitting the API; data-bound blocks
that bypass the hooks (today: `CommentList`, which delegates to a
`<CommentSection>` that calls `useInfiniteQuery` directly) implement
their own mock branch.

## Events under per-device routing

The 33-event schema is unchanged. Each rendered preset / template
mounts the same surface primitives (`<FeedSurface>`, `<WatchSurface>`,
`<VideoSurface>`) and the same events flow into the same `events`
table. A participant who sees `youtube-mobile` emits the same
`HOME_FEED` / `IMPRESSION` / `FEED_CLICK` shapes as one who sees
`youtube-desktop`. Per-device variation lives in the rendered DOM, not
in the measurement contract.

When analyzing experiments that vary across devices, group event rows
by `session_id → user_id → user_group.device` (via the join through
`users.user_group_id`) to pick out which UI a session was actually
shown. The per-event row doesn't carry a device tag.

## Known asymmetry between presets

- **`youtube-desktop`, `tiktok-desktop`, `tiktok-mobile`** are
  hand-written React components with infinite scroll, timeAgo, and
  custom transitions.
- **`youtube-tablet`, `youtube-mobile`, `tiktok-tablet`** are thin
  `BlockTreeRenderer` wrappers (~10 lines) that defer to the editor's
  default tree for the matching device.

Why: block tree DSL is intentionally less expressive than React (it's
the surface visual editors edit). Imperative behavior like "load more
when last card enters viewport" can't be a block prop. The current
gap could be closed by adding `infiniteScroll` to
`BlockTreeRenderer.FeedTreeRoot`, which would let every wrapper preset
**and** every admin-authored template inherit infinite scroll. Tracked
as a follow-up.

## Migrations relevant to per-device

| Alembic | Change |
|---------|--------|
| `021_template_device` | Added `ui_templates.device` column. Originally introduced a per-(surface, device) `ui_config` matrix — retired in 022. |
| `022_group_device` | Added `user_groups.device` column. Collapsed `ui_config` from `{feed: {desktop, tablet?, mobile?}, watch: {...}}` to flat `{feed, watch}`. Per-(surface, device) matrix replaced with one device per group. |
| `023_youtube_device_split` | Renamed `ui_config.{feed,watch}='youtube'` to `'youtube-desktop'`. Built-in YouTube split into 3 device variants. |
| `024_tiktok_device_split` | Renamed `ui_config.{feed,watch}='tiktok'` to `'tiktok-desktop'`. Built-in TikTok split into 3 device variants. |

## See also

- [`adding-a-ui.md`](./adding-a-ui.md) — code-track preset authoring
  + Visual editor overview.
- [`editor-block-reference.md`](./editor-block-reference.md) —
  block library, props, slot semantics, composition recipes.
- [`event-schema.md`](./event-schema.md) — measurement contract that
  is shared across all device variants.
