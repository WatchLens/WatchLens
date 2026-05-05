/**
 * Block-tree editor — flat accordion. Every block in the tree appears
 * as a single row (header). Clicking the header selects the block and
 * expands its details inline (description + properties + reorder/
 * insert/delete buttons + slot indicators). Other rows stay collapsed.
 *
 * The hierarchical relationship is conveyed by horizontal indent +
 * a small breadcrumb-style "↳" prefix on slot/child rows. Slot labels
 * (e.g. "Each card", "Main column") are rendered as tinted headers
 * between parent and child so the structural meaning stays visible
 * even though the layout is flat.
 *
 * Replaces the earlier nested tree view + separate property panel —
 * properties live inside the expanded row now.
 */
import { useState, type ReactNode, type DragEvent } from 'react'
import type { BlockNode, BlockType } from '@/ui-runtime/blocks'
import {
  appendChild,
  appendToSlot,
  createNode,
  findItemTemplate,
  gridCardTemplate,
  listCardTemplate,
  lookupBlock,
  moveNode,
  moveSibling,
  nodeDisplayName,
  removeNode,
  setSlot,
  updateNodeProps,
} from '@/ui-runtime/blocks'
import BlockPalette from './BlockPalette'
import PropertyPanel from './PropertyPanel'

const DRAG_MIME = 'application/x-watchlens-block-id'

interface BlockTreeNodeEditorProps {
  tree: BlockNode
  selectedId: string | null
  /** Pass `null` to deselect (collapses the inline expansion). */
  onSelect: (id: string | null) => void
  /** Lifted card-group state so the preview can stay focused on a
   *  card even when no atom is selected. */
  expandedCardGroupKey: string | null
  onCardGroupKeyChange: (key: string | null) => void
  onChange: (newTree: BlockNode) => void
}

interface PaletteState {
  parentId: string
  parentType: BlockType
  /** null = insert into children[] of parent. string = insert into named slot. */
  slot: string | null
}

interface FlatRow {
  kind: 'block'
  /** True for rows nested inside a "card group" (VideoList.item slot
   *  contents). The editor renders these with a tinted bg + smaller
   *  type so the page-level structure (top tabs) reads distinctly
   *  from the per-card composition (expanded group). */
  inCardGroup: boolean
  /** Depth within the card group (0 = card root, 1 = first nested
   *  child, …). Drives the tree-style indent inside the card panel.
   *  Always 0 for top-level rows outside any card group. */
  depthInCard: number
  node: BlockNode
  isRoot: boolean
  /** True for the slot's primary (first) child — the card root. The
   *  editor disables × on this row so the slot can't be emptied. */
  isCardRoot: boolean
}
interface SlotRow {
  kind: 'slot'
  parentNode: BlockNode
  slotName: string
  slotLabel: string
  isEmpty: boolean
}
interface CardGroupRow {
  kind: 'card-group'
  videoListNode: BlockNode
  /** Stable string for `expanded` state lookup (`<videoListId>::item`). */
  groupKey: string
  /** When true, the editor emits the card subtree below this row. */
  expanded: boolean
  /** First child of the slot, used as the selection / outline target. */
  primaryChildId: string | null
  isEmpty: boolean
}
type Row = FlatRow | SlotRow | CardGroupRow

/**
 * Walk the tree depth-first, emitting:
 * - one row per top-level block (Page, VideoList, SplitColumn, …)
 * - one slot row per non-`item` slot (SplitColumn main/sidebar, Tabs panels)
 * - one synthetic "card group" row per VideoList.`item` slot — clicking
 *   it expands the card composition (the slot's children, flattened);
 *   collapsed by default so the page-level surface is at most ~3 rows.
 */
function flattenTree(root: BlockNode, activeGroupKey: string | null): Row[] {
  const out: Row[] = []
  const visit = (
    node: BlockNode,
    isRoot: boolean,
    inCardGroup: boolean,
    depthInCard: number,
    isCardRoot: boolean,
  ): void => {
    out.push({ kind: 'block', node, isRoot, inCardGroup, depthInCard, isCardRoot })
    if (node.children) {
      const nextDepth = inCardGroup ? depthInCard + 1 : 0
      for (const c of node.children) visit(c, false, inCardGroup, nextDepth, false)
    }
    const spec = lookupBlock(node.type)
    const slotNames = spec?.slots
    if (slotNames && slotNames.length > 0) {
      for (const slotName of slotNames) {
        const slotChildren = node.slots?.[slotName] ?? []
        // VideoList.item is the iterated card template — represent the
        // whole subtree as one collapsible "card group" row.
        if (node.type === 'VideoList' && slotName === 'item') {
          const groupKey = `${node.id}::item`
          const expanded = groupKey === activeGroupKey
          out.push({
            kind: 'card-group',
            videoListNode: node,
            groupKey,
            expanded,
            primaryChildId: slotChildren[0]?.id ?? null,
            isEmpty: slotChildren.length === 0,
          })
          if (expanded) {
            slotChildren.forEach((c, idx) => {
              // depth=0 for the card root; isCardRoot true on the first
              // child so its delete button can be disabled.
              visit(c, false, true, 0, idx === 0)
            })
          }
          continue
        }
        const slotLabel = spec.slotLabels?.[slotName] ?? slotName
        out.push({
          kind: 'slot',
          parentNode: node,
          slotName,
          slotLabel,
          isEmpty: slotChildren.length === 0,
        })
        const nextDepth = inCardGroup ? depthInCard + 1 : 0
        for (const c of slotChildren) visit(c, false, inCardGroup, nextDepth, false)
      }
    }
  }
  visit(root, true, false, 0, false)
  return out
}

export default function BlockTreeNodeEditor({
  tree,
  selectedId,
  onSelect,
  expandedCardGroupKey,
  onCardGroupKeyChange,
  onChange,
}: BlockTreeNodeEditorProps): JSX.Element {
  const [palette, setPalette] = useState<PaletteState | null>(null)

  // Auto-open the group if selection lands inside its slot (e.g. via
  // palette insert or preview-click on an atom). The explicit
  // `expandedCardGroupKey` wins so re-clicking a selected atom (which
  // sets `selectedId=null`) doesn't auto-collapse the surrounding group.
  const selectedInside = findItemTemplate(tree, selectedId)
  const effectiveGroupKey =
    expandedCardGroupKey ??
    (selectedInside ? `${selectedInside.videoListId}::item` : null)
  const rows = flattenTree(tree, effectiveGroupKey)

  const openPalette = (parentId: string, parentType: BlockType, slot: string | null): void => {
    setPalette({ parentId, parentType, slot })
  }
  const closePalette = (): void => setPalette(null)

  const handlePick = (type: BlockType): void => {
    if (!palette) return
    const child = createNode(type)
    if (palette.slot) {
      onChange(appendToSlot(tree, palette.parentId, palette.slot, child))
    } else {
      onChange(appendChild(tree, palette.parentId, child))
    }
    onSelect(child.id)
    // Selecting the new child auto-expands the card group via the
    // selection-derived `activeGroupKey` calculation above.
  }

  const contextLabel = palette
    ? palette.slot
      ? `Adding inside ${palette.parentType} › ${palette.slot}`
      : `Adding inside ${palette.parentType}`
    : undefined

  return (
    <>
      <div className="text-sm">
        {rows.map((row) => {
          if (row.kind === 'block') {
            const isSel = selectedId === row.node.id
            return (
              <BlockRow
                key={row.node.id}
                node={row.node}
                isRoot={row.isRoot}
                inCardGroup={row.inCardGroup}
                depthInCard={row.depthInCard}
                isCardRoot={row.isCardRoot}
                isSelected={isSel}
                onSelect={() => {
                  if (row.inCardGroup) {
                    // Inner atom toggle. The card group's open state is
                    // independent — re-clicking just clears selection,
                    // group stays expanded.
                    onSelect(isSel ? null : row.node.id)
                    return
                  }
                  // Top-level row (Page, VideoList outside any card,
                  // root). Selecting closes any open card group;
                  // re-clicking the selected row deselects entirely.
                  if (isSel) {
                    onSelect(null)
                  } else {
                    onCardGroupKeyChange(null)
                    onSelect(row.node.id)
                  }
                }}
                tree={tree}
                onChange={onChange}
                openPalette={openPalette}
              />
            )
          }
          if (row.kind === 'card-group') {
            const isPrimarySelected =
              row.primaryChildId !== null && selectedId === row.primaryChildId
            const isOpen = row.expanded
            return (
              <CardGroupRow
                key={row.groupKey}
                expanded={isOpen}
                isSelected={isPrimarySelected}
                onSelect={() => {
                  if (isOpen) {
                    // Already open → collapse the whole group.
                    onCardGroupKeyChange(null)
                    onSelect(null)
                  } else {
                    // Open the group; select the card root so its
                    // properties panel is the first thing visible.
                    onCardGroupKeyChange(row.groupKey)
                    if (row.primaryChildId) onSelect(row.primaryChildId)
                  }
                }}
              />
            )
          }
          return (
            <SlotHeader
              key={`${row.parentNode.id}::${row.slotName}`}
              parentNode={row.parentNode}
              slotName={row.slotName}
              slotLabel={row.slotLabel}
              isEmpty={row.isEmpty}
              tree={tree}
              onChange={onChange}
              openPalette={openPalette}
            />
          )
        })}
      </div>
      <BlockPalette
        isOpen={palette !== null}
        onClose={closePalette}
        onPick={handlePick}
        hideTypes={['Page']}
        contextLabel={contextLabel}
      />
    </>
  )
}

const ICON_BY_CATEGORY: Record<string, string> = {
  page: 'bg-purple-100 text-purple-700',
  container: 'bg-blue-100 text-blue-700',
  'data-bound': 'bg-green-100 text-green-700',
  atom: 'bg-orange-100 text-orange-700',
}

interface BlockRowProps {
  node: BlockNode
  isRoot: boolean
  /** True if this row is part of an expanded card group; rendered with
   *  a tinted bg + smaller type to distinguish from page-level tabs. */
  inCardGroup: boolean
  /** Indent depth within the card group (0 = card root). */
  depthInCard: number
  /** True if this row is the slot's root child; the editor disables the
   *  delete (×) button so the card slot can't be emptied. */
  isCardRoot: boolean
  isSelected: boolean
  onSelect: () => void
  tree: BlockNode
  onChange: (newTree: BlockNode) => void
  openPalette: (parentId: string, parentType: BlockType, slot: string | null) => void
}

function BlockRow({
  node,
  isRoot,
  inCardGroup,
  depthInCard,
  isCardRoot,
  isSelected,
  onSelect,
  tree,
  onChange,
  openPalette,
}: BlockRowProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const spec = lookupBlock(node.type)
  const category = spec?.category ?? 'atom'
  const iconClass = ICON_BY_CATEGORY[category] ?? ICON_BY_CATEGORY.atom
  const acceptsChildren = spec?.acceptsChildren ?? false
  const hasSlots = (spec?.slots?.length ?? 0) > 0

  const handleMove = (delta: -1 | 1): void => {
    onChange(moveSibling(tree, node.id, delta))
  }
  const handleDelete = (): void => {
    onChange(removeNode(tree, node.id))
    onSelect()  // selection re-aim handled by parent on subsequent render; this simply triggers re-select
  }
  const handleDragStart = (e: DragEvent): void => {
    if (isRoot) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData(DRAG_MIME, node.id)
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }
  const handleDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    e.stopPropagation()
    setDragOver(true)
  }
  const handleDragLeave = (): void => setDragOver(false)
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const srcId = e.dataTransfer.getData(DRAG_MIME)
    if (!srcId || srcId === node.id) return
    onChange(moveNode(tree, srcId, node.id, null))
  }

  const handlePropChange = (key: string, value: unknown): void => {
    let next = updateNodeProps(tree, node.id, { [key]: value })
    // Special-case: VideoList.layout switch swaps the slot.item card
    // template to the matching default. Researchers can edit the new
    // template afterwards (font, color, atom presence) — the switch
    // is a starter chooser, not a one-way lock.
    if (node.type === 'VideoList' && key === 'layout') {
      const card = value === 'list' ? listCardTemplate() : gridCardTemplate()
      next = setSlot(next, node.id, 'item', [card])
    }
    onChange(next)
  }

  // In-card-group rows: tinted bg, smaller text, indented — visually
  // sits beneath the page-level tabs as a separate section. Indent
  // grows with `depthInCard` so nesting reads like a tree.
  const containerBg = inCardGroup
    ? isSelected
      ? 'bg-blue-100/60'
      : 'bg-gray-50'
    : isSelected
    ? 'bg-blue-50/60'
    : 'bg-white'
  const basePad = inCardGroup ? 16 : 16
  const indentPx = inCardGroup ? basePad + depthInCard * 16 : basePad
  const textSize = inCardGroup ? 'text-[12px]' : 'text-sm'
  const iconSize = inCardGroup ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]'
  return (
    <div className={`border-b border-gray-100 ${containerBg}`}>
      {/* Header */}
      <div
        draggable={!isRoot}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={onSelect}
        className={`flex items-center gap-2 py-2 pr-4 cursor-pointer transition-colors ${
          isSelected
            ? 'border-l-4 border-l-blue-500'
            : dragOver
            ? 'bg-blue-100 border-l-4 border-l-blue-400'
            : 'border-l-4 border-l-transparent hover:bg-gray-50'
        }`}
        style={{ paddingLeft: indentPx }}
      >
        <span
          className={`rounded flex items-center justify-center font-bold shrink-0 ${iconSize} ${iconClass}`}
        >
          {node.type.slice(0, 2).toUpperCase()}
        </span>
        <span className={`${textSize} text-gray-900 font-medium truncate flex-1`}>
          {nodeDisplayName(node)}
        </span>
        {isSelected && (
          <div className="flex items-center gap-0.5 shrink-0">
            <IconButton
              title="Move up"
              disabled={isRoot}
              onClick={(e) => {
                e.stopPropagation()
                if (!isRoot) handleMove(-1)
              }}
            >
              ↑
            </IconButton>
            <IconButton
              title="Move down"
              disabled={isRoot}
              onClick={(e) => {
                e.stopPropagation()
                if (!isRoot) handleMove(1)
              }}
            >
              ↓
            </IconButton>
            <IconButton
              title={isCardRoot ? 'Card root cannot be deleted' : 'Delete'}
              disabled={isRoot || isCardRoot}
              onClick={(e) => {
                e.stopPropagation()
                if (!isRoot && !isCardRoot) handleDelete()
              }}
            >
              ×
            </IconButton>
            {!hasSlots && acceptsChildren && (
              <IconButton
                title="Add child"
                onClick={(e) => {
                  e.stopPropagation()
                  openPalette(node.id, node.type, null)
                }}
              >
                +
              </IconButton>
            )}
          </div>
        )}
      </div>

      {/* Expanded content (when selected) */}
      {isSelected && (
        <div className="bg-white border-t border-gray-100">
          <PropertyPanel selectedNode={node} onChange={handlePropChange} />
        </div>
      )}
    </div>
  )
}

interface SlotHeaderProps {
  parentNode: BlockNode
  slotName: string
  slotLabel: string
  isEmpty: boolean
  tree: BlockNode
  onChange: (newTree: BlockNode) => void
  openPalette: (parentId: string, parentType: BlockType, slot: string | null) => void
}

function SlotHeader({
  parentNode,
  slotName,
  slotLabel,
  isEmpty,
  tree,
  onChange,
  openPalette,
}: SlotHeaderProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false)
  const handleDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }
  const handleDragLeave = (): void => setDragOver(false)
  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const srcId = e.dataTransfer.getData(DRAG_MIME)
    if (!srcId) return
    onChange(moveNode(tree, srcId, parentNode.id, slotName))
  }
  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex items-center gap-2 py-1.5 px-4 text-[11px] uppercase tracking-wider transition-colors border-b border-gray-100 ${
        dragOver ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'
      }`}
    >
      <span className="font-semibold">{slotLabel}</span>
      {isEmpty && (
        <span className="text-gray-400 normal-case tracking-normal">— empty</span>
      )}
      <button
        type="button"
        className="ml-auto text-gray-500 hover:text-blue-600 text-sm font-bold px-1.5"
        title={isEmpty ? 'Add block to slot' : 'Append block to slot'}
        onClick={(e) => {
          e.stopPropagation()
          openPalette(parentNode.id, parentNode.type, slotName)
        }}
      >
        +
      </button>
    </div>
  )
}

interface CardGroupRowProps {
  expanded: boolean
  isSelected: boolean
  onSelect: () => void
}

/**
 * Synthetic top-level row representing a VideoList.item slot — the card
 * template that gets repeated per video. Clicking the row both selects
 * the card root (so the preview outlines the full card) and expands
 * the card's atom composition below this row in the tree.
 *
 * The expanded inner rows are rendered with a tinted bg + smaller
 * type so the page-level structure (Page / VideoList / Card group)
 * stays distinct from the per-card composition.
 */
function CardGroupRow({
  expanded,
  isSelected,
  onSelect,
}: CardGroupRowProps): JSX.Element {
  return (
    <>
      <div
        onClick={onSelect}
        className={`flex items-center gap-2 py-2.5 pl-4 pr-3 cursor-pointer transition-colors border-b border-gray-200 ${
          isSelected
            ? 'bg-blue-50/60 border-l-4 border-l-blue-500'
            : 'border-l-4 border-l-transparent bg-white hover:bg-gray-50'
        }`}
      >
        <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 bg-rose-100 text-rose-700">
          VC
        </span>
        <span className="text-sm text-gray-900 font-medium flex-1 truncate">
          Video Card{' '}
          <span className="text-[10px] text-gray-400 font-normal ml-1">repeats per video</span>
        </span>
        <span
          className="text-xs text-gray-400 px-1 shrink-0 select-none"
          aria-hidden
        >
          {expanded ? '▾' : '▸'}
        </span>
      </div>
      {/* Visual divider separating page-level tabs from per-card atoms.
          No add affordance here — every nested container (Group / Grid)
          inside the card has its own "+" for inserting children. */}
      {expanded && (
        <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-100 border-y border-gray-200">
          ↓ inside the card
        </div>
      )}
    </>
  )
}

function IconButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  title?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-6 h-6 flex items-center justify-center rounded text-sm font-bold transition-colors ${
        disabled
          ? 'text-gray-300 cursor-not-allowed'
          : 'text-gray-500 hover:bg-blue-100 hover:text-blue-700'
      }`}
    >
      {children}
    </button>
  )
}
