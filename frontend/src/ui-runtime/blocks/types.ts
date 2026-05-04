/**
 * Block tree types — the data model and renderer contract for the
 * editor track. The four built-in code-track presets are the visual
 * targets the editor must be able to recreate; this file defines the
 * vocabulary shared between the editor and the runtime renderer.
 */
import type { ComponentType, ReactNode } from 'react'
import type { Video } from '@/types'

/** All block kinds in the platform palette. */
export type BlockType =
  | 'Page'
  | 'Stack'
  | 'Grid'
  | 'SplitColumn'
  | 'Spacer'
  | 'Tabs'
  | 'VideoList'
  | 'VideoPlayer'
  | 'Thumbnail'
  | 'ChannelAvatar'
  | 'VideoTitle'
  | 'VideoChannel'
  | 'VideoViews'
  | 'VideoLikes'
  | 'VideoDuration'
  | 'VideoDescription'
  | 'VideoTags'
  | 'VideoActions'
  | 'CommentList'

/**
 * A node in the block tree. Stored as JSON in `feed_tree` / `watch_tree`
 * (alembic 016). Container blocks use `children`; multi-slot blocks
 * (SplitColumn, Tabs, VideoList) use `slots`.
 */
export interface BlockNode {
  /** Stable id within the tree — used as React keys and editor selection target. */
  id: string
  type: BlockType
  /** Per-block properties; schema is declared by the block's BlockSpec.propSchema. */
  props: Record<string, unknown>
  /** Flat children (Stack, Grid, Page, …). Mutually exclusive with `slots`. */
  children?: BlockNode[]
  /** Named slots (SplitColumn { main, sidebar }; VideoList { item }; Tabs { panel-<id> }). */
  slots?: Record<string, BlockNode[]>
}

/**
 * Render-time environment threaded down the tree. Each container can
 * push overrides (most importantly, `iter` from a VideoList).
 */
export interface RenderEnv {
  /** The page mode. Drives the outer surface choice and watch-only blocks. */
  page: 'feed' | 'watch'
  /** Watch-page only: the URL-pinned current video. Atoms read this when not in iter. */
  pageVideo?: Video
  /** Set by VideoList per iteration. Atoms read this in priority over pageVideo. */
  iter?: {
    source: 'feed' | 'related'
    video: Video
    position: number
  }
  /** Pre-fetched data exposed to data-bound blocks so they don't refetch. */
  feedVideos?: Video[]
  relatedVideos?: Video[]
  /** Navigate to /watch/:id. Provided so blocks don't import react-router. */
  navigateToVideo: (videoId: string) => void
  /**
   * Editor-preview only. When set and a node's id matches, the renderer
   * wraps that node's output in a dashed outline so admin can see
   * which DOM region a tree row corresponds to. Production rendering
   * leaves this undefined and skips the outline entirely.
   */
  highlightId?: string | null
}

/** Read the active bound video, with iteration taking priority over page video. */
export function activeVideo(env: RenderEnv): Video | undefined {
  return env.iter?.video ?? env.pageVideo
}

/** Property type — drives both storage shape and editor widget. */
export type PropType =
  | 'color'
  | 'size'
  | 'select'
  | 'number'
  | 'shadow'
  | 'aspect'
  | 'layout'
  | 'toggle'
  | 'spacing-shorthand'
  | 'font'
  | 'alignment'
  | 'text'

export interface PropDef {
  key: string
  label: string
  type: PropType
  options?: string[]
  unit?: string
  /** Optional predicate: hide this prop when it returns false. Drives
   *  conditional UI like "hide columns when layout=list". */
  showWhen?: (props: Record<string, unknown>) => boolean
  min?: number
  max?: number
  /** Optional grouping label in the property panel. */
  group?: string
}

/** Props the renderer passes to every block component. */
export interface BlockRenderProps {
  node: BlockNode
  env: RenderEnv
  /** Render the block's children array (for non-slot containers). */
  renderChildren: (overrides?: Partial<RenderEnv>) => ReactNode
  /** Render the named slot. */
  renderSlot: (name: string, overrides?: Partial<RenderEnv>) => ReactNode
}

export interface BlockSpec {
  type: BlockType
  /** Palette grouping. */
  category: 'page' | 'container' | 'data-bound' | 'atom'
  /** Default props when a fresh node is inserted. */
  defaultProps: Record<string, unknown>
  /** Property panel schema. */
  propSchema: PropDef[]
  /** Slot names; if undefined the block uses a flat children array. */
  slots?: string[]
  /**
   * Friendly label per slot, shown in the tree editor instead of the
   * raw slot id. e.g. `{ item: 'Each card', main: 'Main column' }`.
   * Falls back to the raw slot name if not set.
   */
  slotLabels?: Record<string, string>
  /**
   * Whether this block accepts a flat `children[]` array. Container
   * blocks (Page/Stack/Grid) set true; leaves and slot-only blocks
   * default to false. The editor uses this to decide whether to show
   * an "Add child" + button.
   */
  acceptsChildren?: boolean
  /** Short human-friendly description shown in the property panel. */
  description?: string
  /** True if this block must be the root (Page). */
  isPageRoot?: boolean
  Component: ComponentType<BlockRenderProps>
}

/** Read a typed prop with a fallback. */
export function p<T>(node: BlockNode, key: string, fallback: T): T {
  const v = node.props[key]
  return v === undefined ? fallback : (v as T)
}
