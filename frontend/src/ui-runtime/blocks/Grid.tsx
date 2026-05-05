/**
 * Grid — fixed-column CSS grid. Children land in flow order. Use Grid
 * for feed thumbnail grids and dashboard-style layouts; for the watch
 * page main+sidebar, use SplitColumn (semantic slots, not just layout).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

function GridBlock({ node, renderChildren }: BlockRenderProps): JSX.Element {
  const columns = p<number>(node, 'columns', 4)
  const columnsTemplate = p<string>(node, 'columnsTemplate', '')
  const gap = p<string>(node, 'gap', '16px')
  const background = p<string>(node, 'background', '')
  const padding = p<string>(node, 'padding', '')
  const borderRadius = p<string>(node, 'borderRadius', '')
  // `columnsTemplate` lets researchers express asymmetric column widths
  // (e.g. "168px 1fr" for a thumbnail-left card). When empty we fall
  // back to N equal columns from the simpler `columns` prop.
  const template = columnsTemplate.trim() || `repeat(${columns}, 1fr)`
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: template,
        gap,
        ...(background ? { background } : {}),
        ...(padding ? { padding } : {}),
        ...(borderRadius ? { borderRadius } : {}),
      }}
    >
      {renderChildren()}
    </div>
  )
}

export const GridSpec: BlockSpec = {
  type: 'Grid',
  category: 'container',
  acceptsChildren: true,
  description: 'Fixed-column CSS grid. Children flow left-to-right, then wrap.',
  defaultProps: { columns: 4, gap: '16px', columnsTemplate: '', background: '', padding: '', borderRadius: '' },
  propSchema: [
    { key: 'columns', label: 'Columns', type: 'number', min: 1, max: 12 },
    { key: 'gap', label: 'Gap', type: 'size', unit: 'px' },
    { key: 'columnsTemplate', label: 'Template', type: 'text' },
    { key: 'background', label: 'Background', type: 'color' },
    { key: 'padding', label: 'Padding', type: 'spacing-shorthand', unit: 'px' },
    { key: 'borderRadius', label: 'Radius', type: 'size', unit: 'px' },
  ],
  Component: GridBlock,
}
