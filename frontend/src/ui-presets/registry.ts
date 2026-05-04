/**
 * Built-in UI preset registry — frontend half of the hybrid UI model.
 *
 * Two built-in presets ship as React components: YouTube (longform)
 * and TikTok (shortform with full-screen pager watch). The third
 * built-in slot is `'none'` — a feed-side option that disables the
 * feed page and routes the user straight into the first watchable
 * video on `/`. Admin-authored UIs registered via the visual / code
 * editor surface as additional keys (the `ui_templates.id` UUID); the
 * dispatcher in `pages/user/Feed.tsx` and `pages/user/VideoWatch.tsx`
 * resolves built-in keys here, then falls through to the template
 * renderer for any other key.
 *
 * Adding a built-in preset:
 *   1. Drop a feed.tsx + watch.tsx pair under `ui-presets/<key>/`
 *      using runtime hooks + surfaces.
 *   2. Add an entry to FEED_PRESETS / WATCH_PRESETS below + a
 *      matching BUILTIN_UIS row.
 *
 * Adding a template-based UI is backend-only: publish a UI template
 * via the admin editor, and its UUID is selectable in the algorithm
 * dropdown alongside the built-ins.
 */
import type { ComponentType } from 'react'

import YoutubeFeed from './youtube/feed'
import YoutubeWatch from './youtube/watch'
import TiktokFeed from './tiktok/feed'
import TiktokWatch from './tiktok/watch'
import type { UIPresetInfo } from '@/types/experiment'


export type BuiltinKey = 'youtube' | 'tiktok'

export interface PresetMeta {
  label: string
  description: string
}

export interface FeedPreset {
  Component: ComponentType
  meta: PresetMeta
}

export interface WatchPreset {
  Component: ComponentType
  meta: PresetMeta
}


/** Built-in feed presets. Keys are concrete React components.
 *  `'none'` is also a valid feed key but has no Component — it's
 *  handled directly in the dispatcher (redirect to first video). */
export const FEED_PRESETS: Record<BuiltinKey, FeedPreset> = {
  youtube: {
    Component: YoutubeFeed,
    meta: {
      label: 'YouTube',
      description: 'Classic 4–8 column 16:9 thumbnail grid.',
    },
  },
  tiktok: {
    Component: TiktokFeed,
    meta: {
      label: 'TikTok',
      description: '9:16 vertical thumbnail grid; clicks open the pager-style watch view.',
    },
  },
}

export const WATCH_PRESETS: Record<BuiltinKey, WatchPreset> = {
  youtube: {
    Component: YoutubeWatch,
    meta: {
      label: 'YouTube',
      description: 'Aspect-video player + 16:9 sidebar of related cards.',
    },
  },
  tiktok: {
    Component: TiktokWatch,
    meta: {
      label: 'TikTok',
      description: 'Full-screen vertical pager starting from the current video.',
    },
  },
}


/**
 * Built-in UI metadata as surfaced to the admin algorithm dropdown.
 * The dropdown unions this list with published `ui_templates` rows so
 * built-ins and admin-authored templates are equal citizens. The
 * special `'none'` key is feed-only — it disables the feed page and
 * sends the user straight to the first watchable video on `/`.
 */
export const BUILTIN_UIS: UIPresetInfo[] = [
  {
    key: 'youtube',
    kind: 'builtin',
    label: 'YouTube',
    description: 'Classic 4–8 column 16:9 thumbnail grid + aspect-video player + sidebar of related cards.',
    supports_feed: true,
    supports_watch: true,
  },
  {
    key: 'tiktok',
    kind: 'builtin',
    label: 'TikTok',
    description: '9:16 vertical thumbnail grid + full-screen vertical pager watch.',
    supports_feed: true,
    supports_watch: true,
  },
  {
    key: 'none',
    kind: 'builtin',
    label: 'No feed',
    description: 'Disable the feed page. Users land directly on the first watchable video on /.',
    supports_feed: true,
    supports_watch: false,
  },
]


/** True if `key` matches a built-in preset (ignoring `'none'` which
 *  has no Component — the dispatcher handles it separately). */
export function isBuiltinFeedKey(key: string | undefined): key is BuiltinKey {
  return key === 'youtube' || key === 'tiktok'
}

export function isBuiltinWatchKey(key: string | undefined): key is BuiltinKey {
  return key === 'youtube' || key === 'tiktok'
}
