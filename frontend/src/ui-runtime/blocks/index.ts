/**
 * Public surface of the block runtime.
 *
 * Both the in-app editor and the dispatcher (`custom/feed.tsx` etc.)
 * import from here. Block spec internals stay file-local; only the
 * registry, the renderer, and the data types are exposed.
 */

export type {
  BlockType,
  BlockNode,
  BlockSpec,
  BlockRenderProps,
  RenderEnv,
  PropDef,
  PropType,
} from './types'
export { activeVideo, p } from './types'

export { lookupBlock, listBlocks } from './registry'

export { BlockTreeRenderer, RenderNode } from './BlockTreeRenderer'
export type { BlockTreeRendererProps } from './BlockTreeRenderer'

export { MOCK_FEED_VIDEOS, MOCK_RELATED_VIDEOS, MOCK_PAGE_VIDEO, MOCK_COMMENTS } from './mocks'

export {
  newNodeId,
  createNode,
  findNode,
  walkTree,
  updateNodeProps,
  appendChild,
  appendToSlot,
  setSlot,
  removeNode,
  moveSibling,
  moveNode,
  findItemTemplate,
} from './treeOps'

export {
  DEFAULT_FEED_TREE,
  DEFAULT_WATCH_TREE,
  getDefaultFeedTree,
  getDefaultWatchTree,
} from './defaultTrees'

export {
  BLOCK_DISPLAY_NAME,
  CATEGORY_DISPLAY_NAME,
  blockDisplayName,
  nodeDisplayName,
} from './displayNames'

export { gridCardTemplate, listCardTemplate } from './cardTemplates'

export { blockTreeToTSX } from './codegen'
export type { BlockTreeToTSXOptions } from './codegen'
