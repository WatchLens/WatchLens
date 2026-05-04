/**
 * Block palette modal. Same UX pattern as `UIConfigModal` /
 * `AlgorithmConfigModal` in `ExperimentDetail.tsx` — centered card on a
 * black/50 backdrop, click outside to close.
 *
 * Selecting a block invokes `onPick(type)`; the caller owns the
 * insertion target (children vs slot). The palette closes itself on
 * pick (calls `onClose` after `onPick`).
 */
import type { BlockType } from '@/ui-runtime/blocks'
import { listBlocks, blockDisplayName, CATEGORY_DISPLAY_NAME } from '@/ui-runtime/blocks'

interface BlockPaletteProps {
  isOpen: boolean
  onClose: () => void
  onPick: (type: BlockType) => void
  /** Optional set of block types to hide (e.g. Page can't be inserted). */
  hideTypes?: BlockType[]
  /** Optional context line at the top — e.g. "Adding inside list › item". */
  contextLabel?: string
}

const CATEGORY_TONE: Record<string, string> = {
  container: 'border-blue-200 hover:border-blue-500 hover:bg-blue-50',
  'data-bound': 'border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50',
  atom: 'border-orange-200 hover:border-orange-500 hover:bg-orange-50',
  page: 'border-purple-200 hover:border-purple-500 hover:bg-purple-50',
}

export default function BlockPalette({
  isOpen,
  onClose,
  onPick,
  hideTypes = [],
  contextLabel,
}: BlockPaletteProps): JSX.Element | null {
  if (!isOpen) return null

  const all = listBlocks().filter((s) => !hideTypes.includes(s.type))
  const containers = all.filter((s) => s.category === 'container')
  const dataBound = all.filter((s) => s.category === 'data-bound')
  const atoms = all.filter((s) => s.category === 'atom')

  const handlePick = (t: BlockType): void => {
    onPick(t)
    onClose()
  }

  const Section = ({
    title,
    items,
  }: {
    title: string
    items: typeof all
  }): JSX.Element | null => {
    if (items.length === 0) return null
    return (
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
          {title}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {items.map((s) => (
            <button
              key={s.type}
              type="button"
              onClick={() => handlePick(s.type)}
              className={`py-3 px-3 rounded-lg border-2 text-left transition-colors ${CATEGORY_TONE[s.category] ?? CATEGORY_TONE.atom}`}
            >
              <div className="font-medium text-sm text-gray-900">
                {blockDisplayName(s.type)}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {CATEGORY_DISPLAY_NAME[s.category] ?? s.category}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Insert block</h3>
            {contextLabel && (
              <div className="text-xs text-gray-500 mt-0.5">{contextLabel}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        <Section title="Layout" items={containers} />
        <Section title="Media" items={dataBound} />
        <Section title="Text" items={atoms} />

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
