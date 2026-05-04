import { ReactNode, useEffect, useMemo, useRef } from 'react'
import { usePageTracking } from '@/hooks/usePageTracking'
import { useScrollTracking } from '@/hooks/useScrollTracking'
import { useMouseTracking } from '@/hooks/useMouseTracking'
import { useVisibilityTracking } from '@/hooks/useVisibilityTracking'
import { useViewportTracking } from '@/hooks/useViewportTracking'
import { useVideoTracking } from '@/hooks/useVideoTracking'
import type { Video, VideoImpressionItem } from '@/types'
import { SurfaceContext, type SurfaceContextValue } from './SurfaceContext'

export interface FeedSurfaceProps {
  /**
   * The cumulative list of videos shown in the feed. The surface fires
   * HOME_FEED automatically for any video_id it hasn't seen yet, so paged
   * loads append cleanly without the caller tracking which page fired.
   */
  videos?: Video[]
  children: ReactNode
}

/**
 * Page-level surface for the feed view. Mounting it wires the standardized
 * page-, scroll-, mouse-, viewport-, and visibility-level events; emitting
 * HOME_FEED for newly seen videos is handled here too. Children may compose
 * any UI; per-card events come from <VideoSurface>.
 */
export function FeedSurface({ videos, children }: FeedSurfaceProps): JSX.Element {
  // Page lifecycle (PAGE_LOAD / NAVIGATION / PAGE_EXIT)
  usePageTracking()
  // Scroll, mouse, visibility (SCROLL / MOUSE_MOVEMENT / VISIBILITY_CHANGE / WINDOW_FOCUS / WINDOW_BLUR)
  useScrollTracking()
  useMouseTracking('HOME')
  useVisibilityTracking()

  // Continuous viewport observer (VIEWPORT_VISIBILITY periodic snapshots)
  const { observeElement } = useViewportTracking('HOME')

  // HOME_FEED batch event for newly-seen videos
  const tracking = useVideoTracking()
  const reportedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!videos || videos.length === 0) return
    const fresh: VideoImpressionItem[] = []
    videos.forEach((v, i) => {
      if (reportedRef.current.has(v.video_id)) return
      reportedRef.current.add(v.video_id)
      fresh.push({
        position: i,
        videoId: v.video_id,
        title: v.title || '',
        channelName: v.channel_name || v.category || '',
        duration: v.duration ?? undefined,
        viewCount: v.view_count ?? undefined,
        thumbnailUrl: v.thumbnail_url ?? undefined,
      })
    })
    if (fresh.length > 0) {
      tracking.trackHomeFeed(fresh)
    }
  }, [videos, tracking])

  const value = useMemo<SurfaceContextValue>(
    () => ({ kind: 'HOME', observeElement }),
    [observeElement],
  )

  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
}
