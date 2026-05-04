/**
 * Block registry — explicit array of all block specs. The renderer looks
 * up specs here by `BlockNode.type`; the editor's palette uses the same
 * list to enumerate insertable blocks.
 */
import type { BlockSpec, BlockType } from './types'
import { PageSpec } from './Page'
import { StackSpec } from './Stack'
import { GridSpec } from './Grid'
import { SplitColumnSpec } from './SplitColumn'
import { SpacerSpec } from './Spacer'
import { TabsSpec } from './Tabs'
import { VideoListSpec } from './VideoList'
import { VideoPlayerSpec } from './VideoPlayer'
import { ThumbnailSpec } from './Thumbnail'
import { ChannelAvatarSpec } from './ChannelAvatar'
import { VideoTitleSpec } from './VideoTitle'
import { VideoChannelSpec } from './VideoChannel'
import { VideoViewsSpec } from './VideoViews'
import { VideoLikesSpec } from './VideoLikes'
import { VideoDurationSpec } from './VideoDuration'
import { VideoDescriptionSpec } from './VideoDescription'
import { VideoTagsSpec } from './VideoTags'
import { VideoActionsSpec } from './VideoActions'
import { CommentListSpec } from './CommentList'

const SPECS: BlockSpec[] = [
  PageSpec,
  StackSpec,
  GridSpec,
  SplitColumnSpec,
  SpacerSpec,
  TabsSpec,
  VideoListSpec,
  VideoPlayerSpec,
  ThumbnailSpec,
  ChannelAvatarSpec,
  VideoTitleSpec,
  VideoChannelSpec,
  VideoViewsSpec,
  VideoLikesSpec,
  VideoDurationSpec,
  VideoDescriptionSpec,
  VideoTagsSpec,
  VideoActionsSpec,
  CommentListSpec,
]

const REGISTRY = new Map<BlockType, BlockSpec>(SPECS.map((s) => [s.type, s]))

export function lookupBlock(type: BlockType): BlockSpec | undefined {
  return REGISTRY.get(type)
}

export function listBlocks(): BlockSpec[] {
  return SPECS
}
