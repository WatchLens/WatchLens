/**
 * Page — the root container of any block tree. Owns background, padding,
 * and an optional max-width. The renderer's outer page surface
 * (FeedSurface / WatchSurface) wraps Page from the outside; Page itself
 * is unaware of the page mode.
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

function PageBlock({ node, renderChildren }: BlockRenderProps): JSX.Element {
  const background = p<string>(node, 'background', '#ffffff')
  const padding = p<string>(node, 'padding', '24px')
  const maxWidth = p<string>(node, 'maxWidth', '')
  return (
    <div style={{ minHeight: '100vh', background, padding }}>
      {maxWidth ? (
        <div style={{ maxWidth, margin: '0 auto' }}>{renderChildren()}</div>
      ) : (
        renderChildren()
      )}
    </div>
  )
}

export const PageSpec: BlockSpec = {
  type: 'Page',
  category: 'page',
  isPageRoot: true,
  acceptsChildren: true,
  description: 'Page root. Children stack vertically inside the page padding + max-width.',
  defaultProps: {
    background: '#ffffff',
    padding: '24px',
    maxWidth: '',
  },
  propSchema: [
    { key: 'background', label: 'Background', type: 'color' },
    { key: 'padding', label: 'Padding', type: 'spacing-shorthand', unit: 'px' },
    { key: 'maxWidth', label: 'Max Width', type: 'size', unit: 'px' },
  ],
  Component: PageBlock,
}
