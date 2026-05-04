/**
 * Preview panel.
 *
 * Two modes, switched implicitly by selection:
 *
 *   1. Full preview (default): renders the tree exactly as production
 *      via `<BlockTreeRenderer mock>`. Shows the whole feed/watch page
 *      against a bundled mock dataset.
 *
 *   2. Card focus: when the selected node lives inside a VideoList's
 *      `item` slot, the panel zooms in on that card. Renders just the
 *      item template once, bound to a single mock video, centered and
 *      paddings adjusted so the admin can edit the card's atom layout
 *      close-up. Click the Page block in the tree (or any node outside
 *      the item slot) to exit focus.
 */
import type { ReactNode } from 'react'
import type { BlockNode, RenderEnv } from '@/ui-runtime/blocks'
import {
  BlockTreeRenderer,
  RenderNode,
  MOCK_FEED_VIDEOS,
  findItemTemplate,
  findNode,
} from '@/ui-runtime/blocks'
import { VIEWPORT_WIDTHS } from './constants'
import type { Viewport, PageTab } from './types'

interface PreviewPanelProps {
  activeTab: PageTab
  viewport: Viewport
  tree: BlockNode
  /** Custom CSS textarea content; rendered in a scoped <style> tag. */
  css: string
  /** Selected node id; drives focus mode. */
  selectedId: string | null
  /** Click-rendered-preview-to-select-tree-row callback. */
  onSelect: (id: string | null) => void
  /** Card group whose card the editor is focused on. Drives card-focus
   *  even when no specific atom is selected. */
  expandedCardGroupKey: string | null
}

const SCOPE_CLASS = 'ui-custom-template'

export default function PreviewPanel({
  activeTab,
  viewport,
  tree,
  css,
  selectedId,
  onSelect,
  expandedCardGroupKey,
}: PreviewPanelProps): JSX.Element {
  // Two ways into card-focus:
  //   1. selection landed inside a VideoList.item slot (atom selected)
  //   2. no atom is selected but the user explicitly opened the card
  //      group via its tree row (state lifted in UITemplateEditor).
  // The second path keeps the preview zoomed in on the card so admins
  // can collapse an atom's inline panel without losing the focused view.
  const focus = (() => {
    const fromSel = findItemTemplate(tree, selectedId)
    if (fromSel) return fromSel
    if (expandedCardGroupKey) {
      const [videoListId] = expandedCardGroupKey.split('::')
      const found = findNode(tree, videoListId)
      if (found && found.node.type === 'VideoList') {
        return {
          items: found.node.slots?.item ?? [],
          videoListId,
        }
      }
    }
    return null
  })()
  if (focus) {
    // Highlight propagates into card-focus too — clicking an atom row
    // (Thumbnail / Title / Channel / …) outlines just that atom inside
    // the focused card so the admin can see which sub-region a tree
    // row maps to.
    return (
      <CardFocus
        items={focus.items}
        css={css}
        highlightId={selectedId}
        onSelectFromPreview={onSelect}
      >
        <span className="text-xs text-gray-500">
          Card focus — editing inside <code className="text-gray-700">{focus.videoListId}</code>'s card template.
          Click any node outside this card (e.g. Page) to exit.
        </span>
      </CardFocus>
    )
  }

  return (
    <FullPreview
      activeTab={activeTab}
      viewport={viewport}
      tree={tree}
      css={css}
      highlightId={selectedId}
      onSelectFromPreview={onSelect}
    />
  )
}

function FullPreview({
  activeTab,
  viewport,
  tree,
  css,
  highlightId,
  onSelectFromPreview,
}: Omit<PreviewPanelProps, 'selectedId' | 'onSelect' | 'expandedCardGroupKey'> & {
  highlightId: string | null
  onSelectFromPreview: (id: string | null) => void
}): JSX.Element {
  const width = VIEWPORT_WIDTHS[viewport]
  return (
    <div className="flex-1 bg-gray-100 overflow-auto flex justify-center p-6">
      <div
        className="bg-white rounded-xl shadow-lg overflow-hidden relative"
        style={{
          width,
          maxWidth: viewport === 'desktop' ? '1200px' : width,
          minHeight: '500px',
        }}
      >
        <style>{`.${SCOPE_CLASS} { ${css} }`}</style>
        <div className={SCOPE_CLASS}>
          <BlockTreeRenderer
            page={activeTab}
            tree={tree}
            mock
            highlightId={highlightId}
            onSelectFromPreview={onSelectFromPreview}
          />
        </div>
      </div>
    </div>
  )
}

function CardFocus({
  items,
  css,
  highlightId,
  onSelectFromPreview,
  children,
}: {
  items: BlockNode[]
  css: string
  highlightId: string | null
  onSelectFromPreview: (id: string | null) => void
  children?: ReactNode
}): JSX.Element {
  const mockVideo = MOCK_FEED_VIDEOS[0]
  const env: RenderEnv = {
    page: 'feed',
    feedVideos: [mockVideo],
    relatedVideos: [],
    iter: { source: 'feed', video: mockVideo, position: 0 },
    navigateToVideo: () => {
      /* no-op in editor preview */
    },
    highlightId,
  }
  const handleClick = (e: React.MouseEvent): void => {
    let el: HTMLElement | null = e.target as HTMLElement
    while (el) {
      const id = el.getAttribute?.('data-block-id')
      if (id) {
        e.stopPropagation()
        onSelectFromPreview(id)
        return
      }
      el = el.parentElement
    }
  }

  return (
    <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-200 overflow-auto flex flex-col items-center px-8 py-10 gap-4">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        {children}
      </div>
      <div
        className="bg-white rounded-xl shadow-md p-4"
        style={{ width: 360, maxWidth: '100%' }}
        onClickCapture={handleClick}
      >
        <style>{`.${SCOPE_CLASS} { ${css} }`}</style>
        <div className={SCOPE_CLASS}>
          {items.map((item) => (
            <RenderNode key={item.id} node={item} env={env} />
          ))}
        </div>
      </div>
      <div className="text-[11px] text-gray-400 max-w-md text-center leading-relaxed">
        Bound to mock video #1 ("{mockVideo.title}", channel "{mockVideo.channel_name}").
        The full grid will reappear when you select a node outside this card.
      </div>
    </div>
  )
}
