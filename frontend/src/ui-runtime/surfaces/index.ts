/**
 * Auto-tracking surface primitives.
 *
 * Mounting <FeedSurface> or <WatchSurface> wires the page-level standard
 * events; per-card / per-player events come from <VideoSurface>. Together
 * they enforce the common event schema regardless of which UI track
 * authored the page.
 */

export { FeedSurface } from './FeedSurface'
export type { FeedSurfaceProps } from './FeedSurface'

export { WatchSurface } from './WatchSurface'
export type { WatchSurfaceProps } from './WatchSurface'

export { VideoSurface } from './VideoSurface'
export type { VideoSurfaceProps, PlayerHandlers } from './VideoSurface'

export { useSurfaceContextOptional } from './SurfaceContext'
export type { SurfaceKind } from './SurfaceContext'
