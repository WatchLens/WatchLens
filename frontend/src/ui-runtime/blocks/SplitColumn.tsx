/**
 * SplitColumn — two named slots (main + sidebar) for the watch-page
 * primary/secondary layout. Sidebar can sit on left or right, or be
 * hidden (collapses into a single full-width main).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

function SplitColumnBlock({ node, renderSlot }: BlockRenderProps): JSX.Element {
  const sidebarPosition = p<'left' | 'right' | 'hidden'>(node, 'sidebarPosition', 'right')
  const sidebarWidth = p<string>(node, 'sidebarWidth', '400px')
  const gap = p<string>(node, 'gap', '24px')

  const main = (
    <div style={{ flex: 1, minWidth: 0 }}>{renderSlot('main')}</div>
  )

  if (sidebarPosition === 'hidden') {
    return <div style={{ display: 'flex', gap }}>{main}</div>
  }

  const sidebar = (
    <div style={{ width: sidebarWidth, flexShrink: 0 }}>
      {renderSlot('sidebar')}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'row', gap }}>
      {sidebarPosition === 'left' ? sidebar : main}
      {sidebarPosition === 'left' ? main : sidebar}
    </div>
  )
}

export const SplitColumnSpec: BlockSpec = {
  type: 'SplitColumn',
  category: 'container',
  slots: ['main', 'sidebar'],
  slotLabels: { main: 'Main column', sidebar: 'Sidebar' },
  description: 'Two-column layout: a main column and a sidebar (left or right).',
  defaultProps: { sidebarPosition: 'right', sidebarWidth: '400px', gap: '24px' },
  propSchema: [
    { key: 'sidebarPosition', label: 'Sidebar', type: 'select', options: ['left', 'right', 'hidden'] },
    { key: 'sidebarWidth', label: 'Sidebar Width', type: 'size', unit: 'px' },
    { key: 'gap', label: 'Gap', type: 'size', unit: 'px' },
  ],
  Component: SplitColumnBlock,
}
