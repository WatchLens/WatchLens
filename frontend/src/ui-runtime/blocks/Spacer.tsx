/**
 * Spacer — fixed-size gap. Useful when a Stack's `gap` is too coarse and
 * a single child needs extra breathing room.
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

function SpacerBlock({ node }: BlockRenderProps): JSX.Element {
  const size = p<string>(node, 'size', '16px')
  return <div style={{ height: size, width: size, flexShrink: 0 }} aria-hidden />
}

export const SpacerSpec: BlockSpec = {
  type: 'Spacer',
  category: 'container',
  description: 'Empty fixed-size space. Used to add breathing room between blocks.',
  defaultProps: { size: '16px' },
  propSchema: [{ key: 'size', label: 'Size', type: 'size', unit: 'px' }],
  Component: SpacerBlock,
}
