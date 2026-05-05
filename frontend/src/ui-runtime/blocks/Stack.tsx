/**
 * Group — vertical flex stack of children with a gap. The block has no
 * direction selector: horizontal arrangements use `Grid` with a column
 * template (e.g. `auto 1fr`). One block, one job — keeps the editor's
 * mental model "stack things vertically OR pick Grid for columns"
 * instead of toggling a row/column switch on every container.
 */
import type { CSSProperties } from 'react'
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

const ALIGN_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
}
const JUSTIFY_MAP: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-around': 'space-around',
}

function StackBlock({ node, renderChildren }: BlockRenderProps): JSX.Element {
  const gap = p<string>(node, 'gap', '8px')
  const align = p<string>(node, 'align', 'stretch')
  const justify = p<string>(node, 'justify', 'start')
  const background = p<string>(node, 'background', '')
  const padding = p<string>(node, 'padding', '')
  const borderRadius = p<string>(node, 'borderRadius', '')

  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap,
    alignItems: ALIGN_MAP[align] ?? align,
    justifyContent: JUSTIFY_MAP[justify] ?? justify,
    minWidth: 0,
    ...(background ? { background } : {}),
    ...(padding ? { padding } : {}),
    ...(borderRadius ? { borderRadius } : {}),
  }

  return <div style={style}>{renderChildren()}</div>
}

export const StackSpec: BlockSpec = {
  type: 'Stack',
  category: 'container',
  acceptsChildren: true,
  description: 'Vertical group. Children stack top-to-bottom with a gap. For side-by-side layouts use Grid instead.',
  defaultProps: { gap: '8px', align: 'stretch', justify: 'start', background: '', padding: '', borderRadius: '' },
  propSchema: [
    { key: 'gap', label: 'Gap', type: 'size', unit: 'px' },
    { key: 'align', label: 'Align', type: 'alignment' },
    { key: 'justify', label: 'Justify', type: 'select', options: ['start', 'center', 'end', 'space-between', 'space-around'] },
    { key: 'background', label: 'Background', type: 'color' },
    { key: 'padding', label: 'Padding', type: 'spacing-shorthand', unit: 'px' },
    { key: 'borderRadius', label: 'Radius', type: 'size', unit: 'px' },
  ],
  Component: StackBlock,
}
