/**
 * Block-tree → TSX code generator.
 *
 * Phase 5: visual mode templates can be exported as a TSX file or
 * "ejected" into the code track. The generated source uses the public
 * `BlockTreeRenderer` from `@vidreclab/blocks`, with both the feed and
 * watch trees inlined as typed `BlockNode` literals. Routing is handled
 * by reading `window.location.pathname` — feed dispatcher and watch
 * dispatcher each mount their own copy of the compiled component, so
 * the read happens once per mount and stays stable for that page.
 *
 * The output is intentionally a thin wrapper around `BlockTreeRenderer`
 * rather than a per-block JSX expansion. That makes the export a clean
 * "starting point" for further hand-editing without sacrificing the
 * runtime semantics the visual editor produced. Researchers who want a
 * fully expanded JSX form can replace the renderer call with their own
 * surface + atom composition; the public hooks/surfaces are unchanged.
 */
import type { BlockNode } from './types'

/** Pretty-print a JS value as a TS object literal with 2-space indent. */
function stringifyTree(tree: BlockNode): string {
  return JSON.stringify(tree, null, 2)
}

/** Sanitize a template name into a PascalCase TSX function identifier. */
function sanitizeComponentName(rawName: string | undefined | null): string {
  const fallback = 'CustomTemplate'
  if (!rawName) return fallback
  const cleaned = rawName.replace(/[^A-Za-z0-9]+/g, ' ').trim()
  if (!cleaned) return fallback
  const pascal = cleaned
    .split(/\s+/)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('')
  return /^[A-Za-z]/.test(pascal) ? pascal : `T${pascal}`
}

export interface BlockTreeToTSXOptions {
  /** Template display name; used for the exported function name. */
  templateName?: string | null
  /** When true, prefix the file with a generation banner comment. */
  banner?: boolean
}

/**
 * Generate a TSX source string that renders both feed and watch trees.
 * Routing is implicit: `window.location.pathname` selects the active
 * tree at mount time. Each page-level dispatcher (custom/feed.tsx,
 * custom/watch.tsx) mounts the compiled component fresh, so the read
 * happens per mount and never needs to react to route changes.
 */
export function blockTreeToTSX(
  feedTree: BlockNode,
  watchTree: BlockNode,
  options: BlockTreeToTSXOptions = {},
): string {
  const componentName = sanitizeComponentName(options.templateName)
  const banner = options.banner ?? true

  const header = banner
    ? `/**
 * Generated from a tree-mode template.
 *
 * The visual editor produced this file by inlining the feed and watch
 * block trees and wrapping them in BlockTreeRenderer. Edit freely from
 * here — the platform no longer auto-syncs with the visual editor for
 * this template.
 */
`
    : ''

  const feedLiteral = stringifyTree(feedTree)
  const watchLiteral = stringifyTree(watchTree)

  return `${header}import { BlockTreeRenderer } from '@vidreclab/blocks'
import type { BlockNode } from '@vidreclab/blocks'

const FEED_TREE: BlockNode = ${feedLiteral}

const WATCH_TREE: BlockNode = ${watchLiteral}

export default function ${componentName}(): JSX.Element {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'
  const isWatch = pathname.startsWith('/watch')
  return (
    <BlockTreeRenderer
      page={isWatch ? 'watch' : 'feed'}
      tree={isWatch ? WATCH_TREE : FEED_TREE}
    />
  )
}
`
}
