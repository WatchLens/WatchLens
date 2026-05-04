import { ReactNode, useEffect, useMemo, useRef } from 'react'
import { usePageTracking } from '@/hooks/usePageTracking'
import { useScrollTracking } from '@/hooks/useScrollTracking'
import { useMouseTracking } from '@/hooks/useMouseTracking'
import { useVisibilityTracking } from '@/hooks/useVisibilityTracking'
import { useViewportTracking } from '@/hooks/useViewportTracking'
import { useVideoTracking } from '@/hooks/useVideoTracking'
import type { Video, VideoImpressionItem } from '@/types'
import { SurfaceContext, type SurfaceContextValue } from './SurfaceContext'

export interface WatchSurfaceProps {
  /** The current video on this watch page. VIDEO_META_CAPTURED fires once per change. */
  video: Video | undefined
  /** Related/recommended videos shown on the page. RECOMMENDATIONS fires once per change. */
  relatedVideos?: Video[]
  children: ReactNode
}

/**
 * Page-level surface for the watch view. Wires PAGE_*, SCROLL, MOUSE_*,
 * tab-visibility, and viewport observation, plus VIDEO_META_CAPTURED on the
 * current video and RECOMMENDATIONS on the related-list change.
 *
 * The currently-playing player's playback events (VIDEO_PLAY/PAUSE/SEEK/
 * ENDED/PROGRESS/WATCHED_1S/WATCHED_5S/...) come from <VideoSurface
 * context="watch">.
 */
export function WatchSurface({
  video,
  relatedVideos,
  children,
}: WatchSurfaceProps): JSX.Element {
  const videoId = video?.video_id

  usePageTracking()
  useScrollTracking()
  useMouseTracking('WATCH')
  useVisibilityTracking(videoId)

  const { observeElement } = useViewportTracking('WATCH')

  const tracking = useVideoTracking()

  // VIDEO_META_CAPTURED — once per video change
  const metaFiredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!video || !videoId) return
    if (metaFiredFor.current === videoId) return
    metaFiredFor.current = videoId
    tracking.trackVideoMeta(video)
  }, [video, videoId, tracking])

  // RECOMMENDATIONS — once per (videoId, relatedVideos identity) change
  const recsFiredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!videoId || !relatedVideos || relatedVideos.length === 0) return
    if (recsFiredFor.current === videoId) return
    recsFiredFor.current = videoId
    const items: VideoImpressionItem[] = relatedVideos.map((v, i) => ({
      position: i,
      videoId: v.video_id,
      title: v.title || '',
      channelName: v.channel_name || v.category || '',
      duration: v.duration ?? undefined,
      viewCount: v.view_count ?? undefined,
      thumbnailUrl: v.thumbnail_url ?? undefined,
    }))
    tracking.trackRecommendations(videoId, items)
  }, [videoId, relatedVideos, tracking])

  const value = useMemo<SurfaceContextValue>(
    () => ({ kind: 'WATCH', currentVideoId: videoId, observeElement }),
    [videoId, observeElement],
  )

  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
}
