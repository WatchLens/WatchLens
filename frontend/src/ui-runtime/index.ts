/**
 * Public UI runtime — the platform's contract for both UI authoring tracks.
 *
 * - `data/*`: React hooks the UI calls to read videos, comments, likes, the
 *   user, and to escape-hatch into manual event emission.
 * - `surfaces/*`: components the UI mounts so the standardized event schema
 *   is emitted automatically.
 *
 * Imports from the in-browser code track are rewritten from
 * `@watchlens/runtime` (or `@watchlens/data`, `@watchlens/surfaces`) to
 * `window.__watchlens__` at compile time. Bundled UI presets import from
 * this module path directly.
 */

export * from './data'
export * from './surfaces'
