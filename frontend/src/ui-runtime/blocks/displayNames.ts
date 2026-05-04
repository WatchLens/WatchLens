/**
 * Friendly display names for the editor UI. The internal `BlockType`
 * stays terse and code-y (`Stack`, `VideoList`, …) so the runtime and
 * stored JSON match the React component names. The editor surfaces a
 * less developer-y label for non-engineer admins.
 *
 * Both the palette modal and the tree editor read from this single map
 * so renames propagate everywhere at once.
 */
import type { BlockType } from './types'

export const BLOCK_DISPLAY_NAME: Record<BlockType, string> = {
  Page: 'Page',
  Stack: 'Group',
  Grid: 'Grid',
  SplitColumn: 'Two Columns',
  Spacer: 'Spacer',
  Tabs: 'Tabs',
  VideoList: 'Video List',
  VideoPlayer: 'Player',
  Thumbnail: 'Thumbnail',
  ChannelAvatar: 'Channel Avatar',
  VideoTitle: 'Title',
  VideoChannel: 'Channel Name',
  VideoViews: 'View Count',
  VideoLikes: 'Like Count',
  VideoDuration: 'Duration',
  VideoDescription: 'Description',
  VideoTags: 'Tags',
  VideoActions: 'Like/Dislike Buttons',
  CommentList: 'Comments',
}

export function blockDisplayName(type: BlockType): string {
  return BLOCK_DISPLAY_NAME[type] ?? type
}

/**
 * Per-instance display name. Currently identical to `blockDisplayName`
 * — kept as a distinct entry point so future per-node hints (e.g. the
 * Grid's columnsTemplate summary) can be added in one place.
 */
export function nodeDisplayName(node: { type: BlockType; props: Record<string, unknown> }): string {
  return BLOCK_DISPLAY_NAME[node.type] ?? node.type
}

export const CATEGORY_DISPLAY_NAME: Record<string, string> = {
  page: 'Page',
  container: 'Layout',
  'data-bound': 'Media',
  atom: 'Text',
}
