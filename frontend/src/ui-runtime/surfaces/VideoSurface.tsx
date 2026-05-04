import { ReactNode, useCallback, useEffect, useMemo, useRef } from 'react'
import { useVideoTracking } from '@/hooks/useVideoTracking'
import type { Video } from '@/types'
import type {
  PlayEvent,
  PauseEvent,
  SeekEvent,
  EndedEvent,
  ProgressEvent as PlayerProgressEvent,
  BufferingEvent,
  PlaybackRateEvent,
  VolumeEvent,
  FullscreenEvent,
  KeyboardShortcutEvent,
} from '@/components/video/VideoPlayer'
import { useSurfaceContext } from './SurfaceContext'

/**
 * Player handlers passed by the watch-context VideoSurface to its child via
 * the render prop. They match the VideoPlayer component's prop surface
 * one-to-one so a custom UI can drop them in directly.
 */
export interface PlayerHandlers {
  onPlay: (e: PlayEvent) => void
  onPause: (e: PauseEvent) => void
  onSeek: (e: SeekEvent) => void
  onEnded: (e: EndedEvent) => void
  onProgress: (e: PlayerProgressEvent) => void
  onWatched1s: (e: PlayerProgressEvent) => void
  onWatched5s: (e: PlayerProgressEvent) => void
  onBuffering: (e: BufferingEvent) => void
  onPlaybackRateChange: (e: PlaybackRateEvent) => void
  onVolumeChange: (e: VolumeEvent) => void
  onFullscreenChange: (e: FullscreenEvent) => void
  onKeyboardShortcut: (e: KeyboardShortcutEvent) => void
  onVideoReady?: (duration: number) => void
}

interface CardSurfaceProps {
  video: Video
  position: number
  context: 'feed' | 'related'
  /** Click handler the surface invokes after firing FEED_CLICK / VIDEO_CLICK. */
  onClick?: () => void
  /** Hover-to-click threshold for THUMBNAIL_HOVER (ms). Defaults to 200. */
  hoverNoiseFloorMs?: number
  children: ReactNode
}

interface PlayerSurfaceProps {
  video: Video
  context: 'watch'
  children: (handlers: PlayerHandlers) => ReactNode
}

export type VideoSurfaceProps = CardSurfaceProps | PlayerSurfaceProps

const HOVER_NOISE_FLOOR_MS = 200

/**
 * Per-video surface. In feed/related context it instruments a card element
 * (IMPRESSION, THUMBNAIL_HOVER, FEED_CLICK / VIDEO_CLICK). In watch context
 * it produces the playback event handlers a player component should consume.
 *
 * The surface is mode-discriminated by `context`, which describes the
 * **per-video role**:
 *   - 'feed'    — card on the feed page
 *   - 'related' — card on the watch page sidebar
 *   - 'watch'   — the currently-playing video on the watch page
 *
 * Note: this is distinct from the **page-level** kind on SurfaceContext
 * ('HOME' or 'WATCH'). VideoSurface's `context` describes one card/player;
 * the parent FeedSurface/WatchSurface decides the page kind. The two are
 * deliberately not the same vocabulary so each layer's intent is explicit.
 *
 * Watch mode uses a render-prop child to expose `PlayerHandlers`; feed/
 * related mode use ordinary children. This is the only place the API
 * shape diverges between modes; the discriminated union enforces it at
 * the type level.
 *
 * Source dispatch is the caller's responsibility. PlayerHandlers match
 * the bundled <VideoPlayer> (raw <video>) one-to-one. For external
 * embeds (YouTube, Vimeo, ...) a separate adapter component must consume
 * the same handlers and translate them into the embed's API. See
 * docs/event-schema.md "Embedded video sources" for the fidelity
 * limitations and the recommended adapter pattern.
 */
export function VideoSurface(props: VideoSurfaceProps): JSX.Element {
  if (props.context === 'watch') {
    return <PlayerVideoSurface {...props} />
  }
  return <CardVideoSurface {...props} />
}

// ── Card mode (feed / related) ───────────────────────────────────

function CardVideoSurface({
  video,
  position,
  context,
  onClick,
  hoverNoiseFloorMs = HOVER_NOISE_FLOOR_MS,
  children,
}: CardSurfaceProps): JSX.Element {
  const tracking = useVideoTracking()
  const surface = useSurfaceContext()

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const impressionFiredRef = useRef(false)
  const hoverStartRef = useRef<number | null>(null)

  // Register with the parent surface's continuous viewport observer.
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      wrapperRef.current = el
      surface.observeElement(el)
    },
    [surface],
  )

  // One-shot IMPRESSION (50% threshold, fires once per mount).
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !impressionFiredRef.current) {
          impressionFiredRef.current = true
          tracking.trackImpression(video.video_id, position)
        }
      },
      { threshold: 0.5 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [video.video_id, position, tracking])

  const fireClick = useCallback(() => {
    if (context === 'feed') {
      tracking.trackFeedClick(video.video_id, position)
    } else {
      // related → VIDEO_CLICK with `fromVideoId` from the WatchSurface.
      const fromVideoId = surface.currentVideoId ?? ''
      tracking.trackVideoClick(
        video.video_id,
        video.title || '',
        position,
        fromVideoId,
        surface.kind,
      )
    }
  }, [context, position, surface.currentVideoId, surface.kind, tracking, video.title, video.video_id])

  const handleMouseEnter = useCallback(() => {
    hoverStartRef.current = Date.now()
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverStartRef.current !== null) {
      const duration = Date.now() - hoverStartRef.current
      if (duration > hoverNoiseFloorMs) {
        tracking.trackThumbnailHover(
          video.video_id,
          video.title || '',
          position,
          duration,
          false,
          surface.kind,
        )
      }
      hoverStartRef.current = null
    }
  }, [hoverNoiseFloorMs, position, surface.kind, tracking, video.title, video.video_id])

  const handleClick = useCallback(() => {
    // Hover-ended-with-click flavor of THUMBNAIL_HOVER.
    if (hoverStartRef.current !== null) {
      const duration = Date.now() - hoverStartRef.current
      tracking.trackThumbnailHover(
        video.video_id,
        video.title || '',
        position,
        duration,
        true,
        surface.kind,
      )
      hoverStartRef.current = null
    }
    fireClick()
    onClick?.()
  }, [fireClick, onClick, position, surface.kind, tracking, video.title, video.video_id])

  return (
    <div
      ref={setRef}
      data-video-id={video.video_id}
      data-position={position}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {children}
    </div>
  )
}

// ── Player mode (watch) ─────────────────────────────────────────

function PlayerVideoSurface({ video, children }: PlayerSurfaceProps): JSX.Element {
  const tracking = useVideoTracking()
  const videoId = video.video_id

  // Track play state across mounts so unmount-while-playing flushes a
  // VIDEO_ENDED with the running totals (matches VideoWatch's existing
  // bookkeeping so analyses stay comparable).
  const playbackRef = useRef({ playing: false, totalWatched: 0, duration: 0 })

  const handlers = useMemo<PlayerHandlers>(() => ({
    onPlay: (e) => {
      playbackRef.current.playing = true
      tracking.trackPlay(videoId, e)
    },
    onPause: (e) => {
      playbackRef.current.playing = false
      playbackRef.current.totalWatched = e.watchedDuration
      tracking.trackPause(videoId, e)
    },
    onSeek: (e) => tracking.trackSeek(videoId, e),
    onEnded: (e) => {
      playbackRef.current.playing = false
      playbackRef.current.totalWatched = e.totalWatchedTime
      tracking.trackVideoEnded(videoId, e)
    },
    onProgress: (e) => tracking.trackProgress(videoId, e),
    onWatched1s: (e) => tracking.trackVideoWatched1s(videoId, e),
    onWatched5s: (e) => tracking.trackVideoWatched5s(videoId, e),
    onBuffering: (e) => tracking.trackBuffering(videoId, e),
    onPlaybackRateChange: (e) => tracking.trackPlaybackRateChange(videoId, e),
    onVolumeChange: (e) => tracking.trackVolumeChange(videoId, e),
    onFullscreenChange: (e) => tracking.trackFullscreenChange(videoId, e),
    onKeyboardShortcut: (e) => tracking.trackKeyboardShortcut(videoId, e),
    onVideoReady: (duration) => {
      playbackRef.current.duration = duration
    },
  }), [videoId, tracking])

  // Flush a synthetic VIDEO_ENDED if the player is unmounted mid-play.
  useEffect(() => {
    return () => {
      const state = playbackRef.current
      if (state.playing && state.totalWatched > 0) {
        tracking.trackVideoEnded(videoId, {
          duration: state.duration,
          totalWatchedTime: state.totalWatched,
          completionRate: state.duration
            ? Math.min(state.totalWatched / state.duration, 2)
            : 0,
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  return <>{children(handlers)}</>
}
