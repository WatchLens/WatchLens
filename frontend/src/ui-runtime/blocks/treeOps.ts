/**
 * Pure functional operations on a BlockNode tree. The editor's tree
 * editor calls these to compute new trees on every mutation, then sets
 * React state — no in-place mutation, so undo/redo can be added later
 * by snapshotting the state.
 */
import type { BlockNode, BlockType } from './types'
import { lookupBlock } from './registry'

let counter = 0

/** Generate a stable-ish id for newly inserted nodes. */
export function newNodeId(prefix = 'node'): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

/** Construct a fresh node of the given type, populated with default props. */
export function createNode(type: BlockType): BlockNode {
  const spec = lookupBlock(type)
  if (!spec) {
    throw new Error(`createNode: unknown block type '${type}'`)
  }
  return {
    id: newNodeId(type.toLowerCase()),
    type,
    props: { ...spec.defaultProps },
  }
}

/** Walk the tree (children + all slots) calling fn at each node. */
export function walkTree(node: BlockNode, fn: (n: BlockNode, parentId: string | null) => void): void {
  const visit = (n: BlockNode, parent: string | null): void => {
    fn(n, parent)
    n.children?.forEach((c) => visit(c, n.id))
    if (n.slots) {
      for (const slotChildren of Object.values(n.slots)) {
        slotChildren.forEach((c) => visit(c, n.id))
      }
    }
  }
  visit(node, null)
}

/** Find a node by id, returning the node and its parent. */
export function findNode(
  root: BlockNode,
  id: string,
): { node: BlockNode; parent: BlockNode | null } | null {
  if (root.id === id) return { node: root, parent: null }
  const stack: Array<{ n: BlockNode; parent: BlockNode | null }> = [{ n: root, parent: null }]
  while (stack.length > 0) {
    const { n, parent } = stack.pop()!
    if (n.id === id) return { node: n, parent }
    n.children?.forEach((c) => stack.push({ n: c, parent: n }))
    if (n.slots) {
      for (const slotChildren of Object.values(n.slots)) {
        slotChildren.forEach((c) => stack.push({ n: c, parent: n }))
      }
    }
  }
  return null
}

/** Return a new tree with the named node's props merged. */
export function updateNodeProps(
  root: BlockNode,
  id: string,
  patch: Record<string, unknown>,
): BlockNode {
  const visit = (n: BlockNode): BlockNode => {
    if (n.id === id) {
      return { ...n, props: { ...n.props, ...patch } }
    }
    return mapNode(n, visit)
  }
  return visit(root)
}

/** Insert a new child at the end of `parentId`'s children array. */
export function appendChild(root: BlockNode, parentId: string, child: BlockNode): BlockNode {
  const visit = (n: BlockNode): BlockNode => {
    if (n.id === parentId) {
      return { ...n, children: [...(n.children ?? []), child] }
    }
    return mapNode(n, visit)
  }
  return visit(root)
}

/** Insert a new child at the end of a named slot. */
export function appendToSlot(
  root: BlockNode,
  parentId: string,
  slotName: string,
  child: BlockNode,
): BlockNode {
  const visit = (n: BlockNode): BlockNode => {
    if (n.id === parentId) {
      const slots = { ...(n.slots ?? {}) }
      slots[slotName] = [...(slots[slotName] ?? []), child]
      return { ...n, slots }
    }
    return mapNode(n, visit)
  }
  return visit(root)
}

/** Remove a node by id from anywhere in the tree (children + slots). */
export function removeNode(root: BlockNode, id: string): BlockNode {
  if (root.id === id) {
    // Removing the root is illegal here — the page block must always exist.
    return root
  }
  const visit = (n: BlockNode): BlockNode => {
    let next = n
    if (next.children?.some((c) => c.id === id)) {
      next = { ...next, children: next.children.filter((c) => c.id !== id) }
    }
    if (next.slots) {
      let mutated = false
      const newSlots: Record<string, BlockNode[]> = {}
      for (const [slot, children] of Object.entries(next.slots)) {
        if (children.some((c) => c.id === id)) {
          newSlots[slot] = children.filter((c) => c.id !== id)
          mutated = true
        } else {
          newSlots[slot] = children
        }
      }
      if (mutated) {
        next = { ...next, slots: newSlots }
      }
    }
    return mapNode(next, visit)
  }
  return visit(root)
}

/** Move a node up or down within its parent's children array. */
export function moveSibling(root: BlockNode, id: string, delta: -1 | 1): BlockNode {
  const visit = (n: BlockNode): BlockNode => {
    let next = n
    if (next.children) {
      const idx = next.children.findIndex((c) => c.id === id)
      if (idx >= 0) {
        const targetIdx = idx + delta
        if (targetIdx >= 0 && targetIdx < next.children.length) {
          const newChildren = [...next.children]
          ;[newChildren[idx], newChildren[targetIdx]] = [newChildren[targetIdx], newChildren[idx]]
          next = { ...next, children: newChildren }
        }
      }
    }
    if (next.slots) {
      let mutated = false
      const newSlots: Record<string, BlockNode[]> = {}
      for (const [slot, children] of Object.entries(next.slots)) {
        const idx = children.findIndex((c) => c.id === id)
        if (idx >= 0) {
          const targetIdx = idx + delta
          if (targetIdx >= 0 && targetIdx < children.length) {
            const reordered = [...children]
            ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
            newSlots[slot] = reordered
            mutated = true
          } else {
            newSlots[slot] = children
          }
        } else {
          newSlots[slot] = children
        }
      }
      if (mutated) {
        next = { ...next, slots: newSlots }
      }
    }
    return mapNode(next, visit)
  }
  return visit(root)
}

/** Replace the contents of a named slot on the given parent. */
export function setSlot(
  root: BlockNode,
  parentId: string,
  slotName: string,
  children: BlockNode[],
): BlockNode {
  const visit = (n: BlockNode): BlockNode => {
    if (n.id === parentId) {
      const slots = { ...(n.slots ?? {}) }
      slots[slotName] = children
      return { ...n, slots }
    }
    return mapNode(n, visit)
  }
  return visit(root)
}

/**
 * Move a node to a new parent (optionally into a slot). The source is
 * removed from its current location; the target inserts it at the end
 * of its children / slot. Refuses to move the root or to drop a node
 * on itself / one of its own descendants (would create a cycle).
 */
export function moveNode(
  root: BlockNode,
  srcId: string,
  targetParentId: string,
  targetSlot: string | null,
): BlockNode {
  if (srcId === targetParentId) return root
  if (srcId === root.id) return root
  const srcInfo = findNode(root, srcId)
  if (!srcInfo || !srcInfo.parent) return root
  if (isDescendant(srcInfo.node, targetParentId)) return root
  const src = srcInfo.node
  const detached = removeNode(root, srcId)
  if (targetSlot) {
    return appendToSlot(detached, targetParentId, targetSlot, src)
  }
  return appendChild(detached, targetParentId, src)
}

/** True if `candidateId` lives anywhere inside `subtree`. */
function isDescendant(subtree: BlockNode, candidateId: string): boolean {
  if (subtree.id === candidateId) return true
  if (subtree.children?.some((c) => isDescendant(c, candidateId))) return true
  if (subtree.slots) {
    for (const slotChildren of Object.values(subtree.slots)) {
      if (slotChildren.some((c) => isDescendant(c, candidateId))) return true
    }
  }
  return false
}

/**
 * If `selectedId` lives anywhere inside some VideoList's `item` slot,
 * return that VideoList's id along with its item template (the slot's
 * children array). The editor's preview panel uses this to switch
 * into "card focus" mode — show a single zoomed-in card matching the
 * template the user is editing, instead of the whole feed grid.
 */
export function findItemTemplate(
  tree: BlockNode,
  selectedId: string | null,
): { items: BlockNode[]; videoListId: string } | null {
  if (!selectedId) return null
  const search = (n: BlockNode): { items: BlockNode[]; videoListId: string } | null => {
    if (n.type === 'VideoList' && n.slots?.item) {
      if (n.slots.item.some((c) => isDescendant(c, selectedId))) {
        return { items: n.slots.item, videoListId: n.id }
      }
    }
    for (const c of n.children ?? []) {
      const res = search(c)
      if (res) return res
    }
    if (n.slots) {
      for (const slotChildren of Object.values(n.slots)) {
        for (const c of slotChildren) {
          const res = search(c)
          if (res) return res
        }
      }
    }
    return null
  }
  return search(tree)
}

/** Recursively rebuild a node's children/slots by mapping each child. */
function mapNode(n: BlockNode, fn: (n: BlockNode) => BlockNode): BlockNode {
  let result = n
  if (n.children) {
    result = { ...result, children: n.children.map(fn) }
  }
  if (n.slots) {
    const newSlots: Record<string, BlockNode[]> = {}
    for (const [slot, children] of Object.entries(n.slots)) {
      newSlots[slot] = children.map(fn)
    }
    result = { ...result, slots: newSlots }
  }
  return result
}
