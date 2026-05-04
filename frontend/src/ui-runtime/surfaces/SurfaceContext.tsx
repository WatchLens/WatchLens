import { createContext, useContext } from 'react'

export type SurfaceKind = 'HOME' | 'WATCH'

export interface SurfaceContextValue {
  /** Page-level surface this child lives in. Drives event payload `context`. */
  kind: SurfaceKind
  /** WatchSurface only: the currently-playing video, used as `fromVideoId` for VIDEO_CLICK on related cards. */
  currentVideoId?: string
  /**
   * Register a card element with the parent surface's continuous viewport
   * observer (drives VIEWPORT_VISIBILITY). The element should expose
   * `data-video-id` and `data-position` data attrs.
   */
  observeElement: (el: HTMLElement | null) => void
}

export const SurfaceContext = createContext<SurfaceContextValue | null>(null)

export function useSurfaceContext(): SurfaceContextValue {
  const ctx = useContext(SurfaceContext)
  if (!ctx) {
    throw new Error(
      'useSurfaceContext: must be inside <FeedSurface> or <WatchSurface>',
    )
  }
  return ctx
}

/** Non-throwing variant for components that may render outside any surface. */
export function useSurfaceContextOptional(): SurfaceContextValue | null {
  return useContext(SurfaceContext)
}
