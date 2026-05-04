import { useRef, useCallback, useMemo } from 'react'
import { useEvents } from '@/contexts/EventContext'
import type {
  PlayEvent,
  PauseEvent,
  SeekEvent,
  EndedEvent,
  ProgressEvent,
  BufferingEvent,
  PlaybackRateEvent,
  VolumeEvent,
  FullscreenEvent,
  KeyboardShortcutEvent,
} from '@/components/video/VideoPlayer'
import type { Video, VideoImpressionItem } from '@/types'

/**
 * Comprehensive event tracking hook for user study logging.
 *
 * Covers:
 * - Feed interactions: impression (deduplicated), feed click
 * - Playback lifecycle: play, pause, seek, ended, progress, buffering
 * - Player controls: playback rate, volume, fullscreen, keyboard shortcut
 * - Video metadata capture
 * - Impression batches: home feed, recommendations
 * - Related video clicks
 * - Thumbnail hover
 */
export function useVideoTracking() {
  const { trackEvent } = useEvents()
  const impressedVideos = useRef<Set<string>>(new Set())

  // --- Feed-level events (backward compatible) ---

  const trackImpression = useCallback(
    (videoId: string, position: number) => {
      if (!impressedVideos.current.has(videoId)) {
        impressedVideos.current.add(videoId)
        trackEvent('IMPRESSION', videoId, { position_in_feed: position })
      }
    },
    [trackEvent]
  )

  const trackFeedClick = useCallback(
    (videoId: string, position: number) => {
      trackEvent('FEED_CLICK', videoId, { position_in_feed: position })
    },
    [trackEvent]
  )

  // --- Video metadata ---

  const trackVideoMeta = useCallback(
    (video: Video) => {
      trackEvent('VIDEO_META_CAPTURED', video.video_id, {
        payload: {
          videoId: video.video_id,
          title: video.title || '',
          channelName: video.channel_name || '',
          category: video.category || '',
          viewCount: video.view_count || 0,
          description: video.description || '',
          tags: video.tags || [],
          duration: video.duration || 0,
          thumbnailUrl: video.thumbnail_url || '',
        },
      })
    },
    [trackEvent]
  )

  // --- Playback events (from VideoPlayer callbacks) ---

  const trackPlay = useCallback(
    (videoId: string, e: PlayEvent) => {
      trackEvent('VIDEO_PLAY', videoId, {
        payload: {
          currentTime: e.currentTime,
          duration: e.duration,
          playbackRate: e.playbackRate,
        },
      })
    },
    [trackEvent]
  )

  const trackPause = useCallback(
    (videoId: string, e: PauseEvent) => {
      trackEvent('VIDEO_PAUSE', videoId, {
        payload: {
          currentTime: e.currentTime,
          duration: e.duration,
          watchedDuration: e.watchedDuration,
        },
      })
    },
    [trackEvent]
  )

  const trackSeek = useCallback(
    (videoId: string, e: SeekEvent) => {
      trackEvent('VIDEO_SEEK', videoId, {
        payload: {
          from: e.from,
          to: e.to,
          seekDistance: e.seekDistance,
          duration: e.duration,
        },
      })
    },
    [trackEvent]
  )

  const trackVideoEnded = useCallback(
    (videoId: string, e: EndedEvent) => {
      trackEvent('VIDEO_ENDED', videoId, {
        watch_ratio: e.completionRate,
        watch_duration: e.totalWatchedTime,
        payload: {
          duration: e.duration,
          totalWatchedTime: e.totalWatchedTime,
          completionRate: e.completionRate,
        },
      })
    },
    [trackEvent]
  )

  const trackProgress = useCallback(
    (videoId: string, e: ProgressEvent) => {
      trackEvent('VIDEO_PROGRESS', videoId, {
        payload: {
          currentTime: e.currentTime,
          duration: e.duration,
          progress: e.progress,
        },
      })
    },
    [trackEvent]
  )

  const trackVideoWatched1s = useCallback(
    (videoId: string, e: ProgressEvent) => {
      // Populate watch_duration + watch_ratio top-level for server-side aggregation.
      trackEvent('VIDEO_WATCHED_1S', videoId, {
        watch_duration: e.currentTime,
        watch_ratio: e.progress,
        payload: {
          currentTime: e.currentTime,
          duration: e.duration,
          progress: e.progress,
        },
      })
    },
    [trackEvent]
  )

  const trackVideoWatched5s = useCallback(
    (videoId: string, e: ProgressEvent) => {
      trackEvent('VIDEO_WATCHED_5S', videoId, {
        watch_duration: e.currentTime,
        watch_ratio: e.progress,
        payload: {
          currentTime: e.currentTime,
          duration: e.duration,
          progress: e.progress,
        },
      })
    },
    [trackEvent]
  )

  const trackBuffering = useCallback(
    (videoId: string, e: BufferingEvent) => {
      trackEvent('VIDEO_BUFFERING', videoId, {
        payload: {
          currentTime: e.currentTime,
          readyState: e.readyState,
          networkState: e.networkState,
        },
      })
    },
    [trackEvent]
  )

  // --- Player control events ---

  const trackPlaybackRateChange = useCallback(
    (videoId: string, e: PlaybackRateEvent) => {
      trackEvent('PLAYBACK_RATE_CHANGE', videoId, {
        payload: { newRate: e.newRate, currentTime: e.currentTime },
      })
    },
    [trackEvent]
  )

  const trackVolumeChange = useCallback(
    (videoId: string, e: VolumeEvent) => {
      trackEvent('VOLUME_CHANGE', videoId, {
        payload: {
          volume: e.volume,
          previousVolume: e.previousVolume,
          muted: e.muted,
          previousMuted: e.previousMuted,
        },
      })
    },
    [trackEvent]
  )

  const trackFullscreenChange = useCallback(
    (videoId: string, e: FullscreenEvent) => {
      trackEvent('FULLSCREEN_CHANGE', videoId, {
        payload: { isFullscreen: e.isFullscreen },
      })
    },
    [trackEvent]
  )

  const trackKeyboardShortcut = useCallback(
    (videoId: string, e: KeyboardShortcutEvent) => {
      trackEvent('KEYBOARD_SHORTCUT', videoId, {
        payload: {
          key: e.key,
          action: e.action,
          currentTime: e.currentTime,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
        },
      })
    },
    [trackEvent]
  )

  // --- Impression batch events ---

  const trackHomeFeed = useCallback(
    (videos: VideoImpressionItem[]) => {
      trackEvent('HOME_FEED', undefined, {
        payload: {
          videoCount: videos.length,
          videos,
        },
      })
    },
    [trackEvent]
  )

  const trackRecommendations = useCallback(
    (currentVideoId: string, recommended: VideoImpressionItem[]) => {
      trackEvent('RECOMMENDATIONS', currentVideoId, {
        payload: {
          currentVideoId,
          recommendedCount: recommended.length,
          recommended,
        },
      })
    },
    [trackEvent]
  )

  // --- Layout events ---

  const trackLayoutChange = useCallback(
    (from: number, to: number, context: string) => {
      trackEvent('LAYOUT_CHANGE', undefined, {
        payload: { from, to, context },
      })
    },
    [trackEvent]
  )

  // --- Interaction events ---

  const trackLike = useCallback(
    (videoId: string, videoPosition?: number) => {
      trackEvent('LIKE', videoId, {
        payload: { videoId, timestamp: videoPosition || 0 },
      })
    },
    [trackEvent]
  )

  const trackDislike = useCallback(
    (videoId: string, videoPosition?: number) => {
      trackEvent('DISLIKE', videoId, {
        payload: { videoId, timestamp: videoPosition || 0 },
      })
    },
    [trackEvent]
  )

  const trackVideoClick = useCallback(
    (clickedVideoId: string, clickedTitle: string, position: number, fromVideoId: string, context: string) => {
      trackEvent('VIDEO_CLICK', clickedVideoId, {
        payload: {
          clickedVideoId,
          clickedTitle,
          position,
          fromVideoId,
          context,
        },
      })
    },
    [trackEvent]
  )

  const trackThumbnailHover = useCallback(
    (videoId: string, title: string, position: number, hoverDurationMs: number, followedByClick: boolean, context: string) => {
      trackEvent('THUMBNAIL_HOVER', videoId, {
        payload: {
          videoId,
          title,
          position,
          hoverDurationMs,
          followed_by_click: followedByClick,
          context,
        },
      })
    },
    [trackEvent]
  )

  return useMemo(() => ({
    // Feed
    trackImpression,
    trackFeedClick,
    // Video meta
    trackVideoMeta,
    // Playback
    trackPlay,
    trackPause,
    trackSeek,
    trackVideoEnded,
    trackProgress,
    trackVideoWatched1s,
    trackVideoWatched5s,
    trackBuffering,
    // Controls
    trackPlaybackRateChange,
    trackVolumeChange,
    trackFullscreenChange,
    trackKeyboardShortcut,
    // Impressions
    trackHomeFeed,
    trackRecommendations,
    // Layout
    trackLayoutChange,
    // Interactions
    trackLike,
    trackDislike,
    trackVideoClick,
    trackThumbnailHover,
  }), [
    trackImpression, trackFeedClick, trackVideoMeta,
    trackPlay, trackPause, trackSeek, trackVideoEnded, trackProgress, trackVideoWatched1s, trackVideoWatched5s, trackBuffering,
    trackPlaybackRateChange, trackVolumeChange, trackFullscreenChange, trackKeyboardShortcut,
    trackHomeFeed, trackRecommendations,
    trackLayoutChange,
    trackLike, trackDislike, trackVideoClick, trackThumbnailHover,
  ])
}
