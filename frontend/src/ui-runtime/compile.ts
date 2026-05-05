/**
 * In-browser TSX compiler for the code track.
 *
 * Researchers paste TSX into the admin editor; the platform compiles it
 * with sucrase at runtime, rewrites runtime imports to read from the
 * window global, and returns a React component. There is no build step.
 *
 * Imports the runtime resolves:
 *   '@watchlens/runtime'   → window.__watchlens__
 *   '@watchlens/data'      → window.__watchlens__.data
 *   '@watchlens/surfaces'  → window.__watchlens__.surfaces
 *   '@watchlens/blocks'    → window.__watchlens__.blocks
 *   'react'                → window.__watchlens__.React
 *
 * Anything else throws at compile time so the researcher sees the missing
 * import in the editor before it can break a participant's session.
 */
import { transform } from 'sucrase'
import type { ComponentType } from 'react'

const KNOWN_IMPORTS: Record<string, string> = {
  '@watchlens/runtime': 'window.__watchlens__',
  '@watchlens/data': 'window.__watchlens__.data',
  '@watchlens/surfaces': 'window.__watchlens__.surfaces',
  '@watchlens/blocks': 'window.__watchlens__.blocks',
  react: 'window.__watchlens__.React',
}

export interface CompileResult {
  Component: ComponentType
}

export class CompileError extends Error {
  constructor(message: string, public readonly source: string) {
    super(message)
    this.name = 'CompileError'
  }
}

/**
 * Rewrite `import { x, y } from '@watchlens/data'` to
 *   `const { x, y } = window.__watchlens__.data`.
 * Default imports become the whole runtime namespace; namespace imports
 * (`import * as X`) too.
 */
function rewriteImports(jsSource: string): string {
  // Named: import { a, b as c } from 'mod'
  jsSource = jsSource.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,
    (_, names, mod) => {
      const target = KNOWN_IMPORTS[mod]
      if (!target) {
        throw new CompileError(
          `Unknown runtime import: '${mod}'. Allowed: ${Object.keys(KNOWN_IMPORTS).join(', ')}`,
          jsSource,
        )
      }
      // sucrase outputs CJS-ish vars, but we just splice. Strip type-only "type" specifiers.
      const cleaned = names
        .split(',')
        .map((n: string) => n.replace(/^\s*type\s+/, '').trim())
        .filter(Boolean)
        .join(', ')
      return `const { ${cleaned} } = ${target};`
    },
  )

  // Default: import X from 'mod'
  jsSource = jsSource.replace(
    /import\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g,
    (_, name, mod) => {
      const target = KNOWN_IMPORTS[mod]
      if (!target) {
        throw new CompileError(`Unknown runtime import: '${mod}'`, jsSource)
      }
      return `const ${name} = ${target}.default ?? ${target};`
    },
  )

  // Namespace: import * as X from 'mod'
  jsSource = jsSource.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g,
    (_, name, mod) => {
      const target = KNOWN_IMPORTS[mod]
      if (!target) {
        throw new CompileError(`Unknown runtime import: '${mod}'`, jsSource)
      }
      return `const ${name} = ${target};`
    },
  )

  return jsSource
}

/**
 * Compile a TSX source string into a React component.
 * Throws CompileError on syntax / unknown-import failures.
 */
export function compileTSX(tsxSource: string): CompileResult {
  let js: string
  try {
    // No 'imports' transform: it rewrites ESM imports into require() calls
    // and var bindings, which conflict with our own import-rewrite below.
    // Letting sucrase emit the source ESM imports keeps our regex pass
    // authoritative on import resolution.
    const result = transform(tsxSource, {
      transforms: ['jsx', 'typescript'],
      production: true,
    })
    js = result.code
  } catch (e) {
    throw new CompileError(
      `Syntax error: ${(e as Error).message}`,
      tsxSource,
    )
  }

  // Sucrase with `imports` transform produces CommonJS-style require() calls
  // and exports. We override that by stripping/rewriting before evaluation.
  // Replace `Object.defineProperty(exports, "__esModule", ...)` boilerplate
  // and capture default export.
  let rewritten: string
  try {
    rewritten = rewriteImports(js)
  } catch (e) {
    if (e instanceof CompileError) throw e
    throw new CompileError(`Import rewrite failed: ${(e as Error).message}`, tsxSource)
  }

  // Capture default export. Without the `imports` transform sucrase keeps
  // the original `export default …` syntax, which `new Function()` rejects.
  // Rewrite to a __default__ binding the wrapper returns.
  rewritten = rewritten
    .replace(/export\s+default\s+/, 'const __default__ = ')
    .replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ')

  // Auto-inject React into scope: sucrase's JSX transform emits
  // React.createElement(...) calls regardless of whether the source
  // imports React, so we expose it unconditionally.
  const wrapped = `
    "use strict";
    const React = window.__watchlens__.React;
    ${rewritten}
    return typeof __default__ !== 'undefined' ? __default__ : null;
  `

  let factory: () => unknown
  try {
    factory = new Function(wrapped) as () => unknown
  } catch (e) {
    throw new CompileError(`Cannot construct function: ${(e as Error).message}`, tsxSource)
  }

  let exported: unknown
  try {
    exported = factory()
  } catch (e) {
    throw new CompileError(`Runtime error during module evaluation: ${(e as Error).message}`, tsxSource)
  }

  if (typeof exported !== 'function') {
    throw new CompileError(
      'Compiled module did not export a default React component (function).',
      tsxSource,
    )
  }

  return { Component: exported as ComponentType }
}
