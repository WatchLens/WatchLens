/**
 * Built-in UI preset registry — frontend half of the hybrid UI model.
 *
 * The YouTube preset ships in three device variants: `youtube-desktop`
 * (4-col grid + 16:9 player + sidebar), `youtube-tablet` (2-col grid,
 * narrower sidebar), and `youtube-mobile` (single-column list, no
 * sidebar — player stacks above meta, comments, related). The TikTok
 * preset (full-screen vertical pager, originally desktop) and the
 * special `'none'` (feed redirect) round out the built-in set.
 *
 * Each user group is bound to a single device class (alembic 022).
 * The dispatcher (`pages/user/Feed.tsx` / `VideoWatch.tsx`) resolves
 * the group's `ui_config.{feed,watch}` key here first, then falls
 * through to admin-authored templates by UUID.
 *
 * Adding a built-in preset:
 *   1. Drop a feed.tsx + watch.tsx pair under `ui-presets/<key>/`
 *      using runtime hooks + surfaces.
 *   2. Add an entry to FEED_PRESETS / WATCH_PRESETS below + a
 *      matching BUILTIN_UIS row + the validator's BUILTIN_*_KEYS map
 *      on the backend.
 */
import type { ComponentType } from 'react'

import YoutubeDesktopFeed from './youtube-desktop/feed'
import YoutubeDesktopWatch from './youtube-desktop/watch'
import YoutubeTabletFeed from './youtube-tablet/feed'
import YoutubeTabletWatch from './youtube-tablet/watch'
import YoutubeMobileFeed from './youtube-mobile/feed'
import YoutubeMobileWatch from './youtube-mobile/watch'
import TiktokDesktopFeed from './tiktok-desktop/feed'
import TiktokDesktopWatch from './tiktok-desktop/watch'
import TiktokTabletFeed from './tiktok-tablet/feed'
import TiktokTabletWatch from './tiktok-tablet/watch'
import TiktokMobileFeed from './tiktok-mobile/feed'
import TiktokMobileWatch from './tiktok-mobile/watch'
import type { UIPresetInfo } from '@/types/experiment'


export type BuiltinKey =
  | 'youtube-desktop'
  | 'youtube-tablet'
  | 'youtube-mobile'
  | 'tiktok-desktop'
  | 'tiktok-tablet'
  | 'tiktok-mobile'

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
  'youtube-desktop': {
    Component: YoutubeDesktopFeed,
    meta: {
      label: 'YouTube (Desktop)',
      description: '4-column 16:9 thumbnail grid with infinite scroll.',
    },
  },
  'youtube-tablet': {
    Component: YoutubeTabletFeed,
    meta: {
      label: 'YouTube (Tablet)',
      description: '2-column 16:9 grid; matches the YouTube iPad layout.',
    },
  },
  'youtube-mobile': {
    Component: YoutubeMobileFeed,
    meta: {
      label: 'YouTube (Mobile)',
      description: 'Single-column list of full-width 16:9 cards.',
    },
  },
  'tiktok-desktop': {
    Component: TiktokDesktopFeed,
    meta: {
      label: 'TikTok (Desktop)',
      description: '9:16 vertical thumbnail grid; clicks open the pager-style watch view.',
    },
  },
  'tiktok-tablet': {
    Component: TiktokTabletFeed,
    meta: {
      label: 'TikTok (Tablet)',
      description: '4-column 9:16 grid with overlaid like count + handle row.',
    },
  },
  'tiktok-mobile': {
    Component: TiktokMobileFeed,
    meta: {
      label: 'TikTok (Mobile)',
      description: '2-column 9:16 grid with overlaid view count + handle row underneath.',
    },
  },
}

export const WATCH_PRESETS: Record<BuiltinKey, WatchPreset> = {
  'youtube-desktop': {
    Component: YoutubeDesktopWatch,
    meta: {
      label: 'YouTube (Desktop)',
      description: 'Aspect-video player + 400px sidebar of related cards.',
    },
  },
  'youtube-tablet': {
    Component: YoutubeTabletWatch,
    meta: {
      label: 'YouTube (Tablet)',
      description: 'Player + narrower (280px) sidebar, tighter padding.',
    },
  },
  'youtube-mobile': {
    Component: YoutubeMobileWatch,
    meta: {
      label: 'YouTube (Mobile)',
      description: 'No sidebar — player → meta → comments → related list stacked.',
    },
  },
  'tiktok-desktop': {
    Component: TiktokDesktopWatch,
    meta: {
      label: 'TikTok (Desktop)',
      description: 'Full-screen vertical pager starting from the current video.',
    },
  },
  'tiktok-tablet': {
    Component: TiktokTabletWatch,
    meta: {
      label: 'TikTok (Tablet)',
      description: 'Split-screen: 9:16 player with right action stack on the left; tabbed panel (Comments / Related 2-col grid) on the right.',
    },
  },
  'tiktok-mobile': {
    Component: TiktokMobileWatch,
    meta: {
      label: 'TikTok (Mobile)',
      description: 'Full-screen 9:16 player + right action stack overlay; comments in bottom sheet; related grid below the fold.',
    },
  },
}


/**
 * Built-in UI metadata as surfaced to the admin algorithm dropdown.
 * The dropdown unions this list with published `ui_templates` rows,
 * filtering by the group's device. Built-ins are tagged for a single
 * device except for `'none'`, which redirects without rendering UI
 * and is therefore device-agnostic.
 */
export const BUILTIN_UIS: UIPresetInfo[] = [
  {
    key: 'youtube-desktop',
    kind: 'builtin',
    label: 'YouTube (Desktop)',
    description: '4-col 16:9 grid + aspect-video player + 400px sidebar of related cards. Infinite scroll on feed.',
    supports_feed: true,
    supports_watch: true,
    devices: ['desktop'],
  },
  {
    key: 'youtube-tablet',
    kind: 'builtin',
    label: 'YouTube (Tablet)',
    description: '2-col grid (YouTube iPad layout) + player + 280px sidebar.',
    supports_feed: true,
    supports_watch: true,
    devices: ['tablet'],
  },
  {
    key: 'youtube-mobile',
    kind: 'builtin',
    label: 'YouTube (Mobile)',
    description: 'Single-column full-width list + no-sidebar watch (player → meta → comments → related).',
    supports_feed: true,
    supports_watch: true,
    devices: ['mobile'],
  },
  {
    key: 'tiktok-desktop',
    kind: 'builtin',
    label: 'TikTok (Desktop)',
    description: '9:16 vertical thumbnail grid + full-screen vertical pager watch.',
    supports_feed: true,
    supports_watch: true,
    devices: ['desktop'],
  },
  {
    key: 'tiktok-tablet',
    kind: 'builtin',
    label: 'TikTok (Tablet)',
    description: '4-col 9:16 grid feed + split-screen watch (9:16 player + tabbed comments / 2-col related grid panel).',
    supports_feed: true,
    supports_watch: true,
    devices: ['tablet'],
  },
  {
    key: 'tiktok-mobile',
    kind: 'builtin',
    label: 'TikTok (Mobile)',
    description: '2-col 9:16 grid feed + full-screen 9:16 watch with right action stack and comment bottom-sheet.',
    supports_feed: true,
    supports_watch: true,
    devices: ['mobile'],
  },
  {
    key: 'none',
    kind: 'builtin',
    label: 'No feed',
    description: 'Disable the feed page. Users land directly on the first watchable video on /.',
    supports_feed: true,
    supports_watch: false,
    devices: ['desktop', 'tablet', 'mobile'],
  },
]


/** True if `key` matches a built-in preset (ignoring `'none'` which
 *  has no Component — the dispatcher handles it separately). */
export function isBuiltinFeedKey(key: string | undefined): key is BuiltinKey {
  return (
    key === 'youtube-desktop' ||
    key === 'youtube-tablet' ||
    key === 'youtube-mobile' ||
    key === 'tiktok-desktop' ||
    key === 'tiktok-tablet' ||
    key === 'tiktok-mobile'
  )
}

export function isBuiltinWatchKey(key: string | undefined): key is BuiltinKey {
  return (
    key === 'youtube-desktop' ||
    key === 'youtube-tablet' ||
    key === 'youtube-mobile' ||
    key === 'tiktok-desktop' ||
    key === 'tiktok-tablet' ||
    key === 'tiktok-mobile'
  )
}
