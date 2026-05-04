/**
 * Tabs — selectable tab bar with one slot per tab id. The `tabs` prop
 * declares the bar layout (`{ id, label }[]`); the corresponding slot
 * (named after each tab id) holds that tab's panel content.
 *
 * Local state owns the selected tab; switching tabs is intentionally
 * not a tracked event (no LAYOUT_CHANGE or similar emitted), since
 * the active tab doesn't change the page's data plane — researchers
 * who want to log tab switches can wire a manual `useTracking` call
 * via the code track.
 *
 * Used by the TikTok watch preset (Comments / Related panels).
 */
import { useState } from 'react'
import type { BlockSpec, BlockRenderProps } from './types'
import { p } from './types'

interface TabDef {
  id: string
  label: string
}

function TabsBlock({ node, renderSlot }: BlockRenderProps): JSX.Element {
  const tabs = p<TabDef[]>(node, 'tabs', [])
  const initialTab = p<string>(node, 'initialTab', tabs[0]?.id ?? '')
  const [active, setActive] = useState(initialTab)

  if (tabs.length === 0) {
    return (
      <div style={{ padding: 12, color: '#900', fontSize: 12, background: '#fee', borderRadius: 4 }}>
        Tabs: no tabs configured
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex-1 px-5 py-3 text-sm font-semibold border-b-2 transition ${
              active === t.id
                ? 'border-current text-gray-900 dark:text-white'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1">{renderSlot(active)}</div>
    </div>
  )
}

export const TabsSpec: BlockSpec = {
  type: 'Tabs',
  category: 'container',
  description: 'Tab bar. Each tab id maps to a slot containing that tab\'s panel.',
  // Slot names are dynamic per tab id; the editor's slot inspector reads
  // the tabs prop to know which slots to expose. The runtime walks any
  // slot name present on the node.
  defaultProps: {
    tabs: [
      { id: 'tab1', label: 'Tab 1' },
      { id: 'tab2', label: 'Tab 2' },
    ],
    initialTab: 'tab1',
  },
  propSchema: [
    { key: 'initialTab', label: 'Initial Tab', type: 'text' },
    // `tabs` is a structured array; the editor will need a custom widget
    // for it. PropDef intentionally has no array-shaped type yet — the
    // visual editor flow for Tabs is a Phase 4d concern.
  ],
  Component: TabsBlock,
}
