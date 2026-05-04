/**
 * Expose the runtime on window so code-track presets compiled at runtime
 * can resolve their imports.
 *
 * Called once from `main.tsx` before the app mounts. After that, code
 * authored with `import { useFeed } from '@vidreclab/data'` resolves to
 * `window.__vidreclab__.data.useFeed` after `compile.ts` rewrites the
 * import.
 */
import * as React from 'react'
import * as data from './data'
import * as surfaces from './surfaces'
import * as blocks from './blocks'

declare global {
  interface Window {
    __vidreclab__?: {
      React: typeof React
      data: typeof data
      surfaces: typeof surfaces
      blocks: typeof blocks
    }
  }
}

export function installRuntimeGlobal(): void {
  if (typeof window === 'undefined') return
  window.__vidreclab__ = {
    React,
    data,
    surfaces,
    blocks,
  }
}
