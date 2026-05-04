import { useState, useRef, useEffect, useCallback } from 'react'
import type { Video, ResolvedUrl } from '@/types'

const THUMBNAIL_EXTENSIONS = ['jpg', 'png', 'webp'] as const

type LikeState = 'like' | 'dislike' | null

interface TikTokPlayerProps {
  video: Video
  isActive: boolean
  onVideoStart: () => void
  onVideoEnd: (watchRatio: number, watchDuration: number) => void
  onLike: () => void
  onDislike: () => void
}

export default function TikTokPlayer({
  video,
  isActive,
  onVideoStart,
  onVideoEnd,
  onLike,
  onDislike,
}: TikTokPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [hasStarted, setHasStarted] = useState(false)
  const [liked, setLiked] = useState<LikeState>(null)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const startTimeRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)

  const resolved: ResolvedUrl | null = video.resolved_url || null
  const isYouTube = resolved?.type === 'youtube'
  const videoSrc = resolved?.embed_url || resolved?.video_url || video.url

  // Thumbnail fallback
  const [extIndex, setExtIndex] = useState(0)
  const [thumbError, setThumbError] = useState(false)
  const thumbBase = resolved?.thumbnail_url || video.thumbnail_url
  const thumbnailSrc: string | null = thumbError
    ? null
    : thumbBase
      ? thumbBase.includes('.')
        ? thumbBase
        : `${thumbBase}.${THUMBNAIL_EXTENSIONS[extIndex]}`
      : null

  const handleThumbError = (): void => {
    if (thumbBase && !thumbBase.includes('.')) {
      if (extIndex < THUMBNAIL_EXTENSIONS.length - 1) {
        setExtIndex((i) => i + 1)
      } else {
        setThumbError(true)
      }
    } else {
      setThumbError(true)
    }
  }

  // Calculate watch metrics
  const getWatchMetrics = useCallback(() => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime || 0
      const duration = videoRef.current.duration || video.duration || 1
      return {
        watchRatio: Math.min(currentTime / duration, 2.0),
        watchDuration: currentTime,
      }
    }
    // For YouTube embeds, estimate based on time
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const duration = video.duration || 60
    return {
      watchRatio: Math.min(elapsed / duration, 2.0),
      watchDuration: elapsed,
    }
  }, [video.duration])

  // Progress bar update loop
  const updateProgress = useCallback(() => {
    if (videoRef.current && isActive && !isPaused) {
      const currentTime = videoRef.current.currentTime || 0
      const duration = videoRef.current.duration || video.duration || 1
      setProgress((currentTime / duration) * 100)
      animFrameRef.current = requestAnimationFrame(updateProgress)
    }
  }, [isActive, isPaused, video.duration])

  // Handle active state changes (play/pause based on visibility)
  useEffect(() => {
    if (isActive) {
      // Start playing
      if (isYouTube) {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo' }),
          '*'
        )
      } else if (videoRef.current) {
        videoRef.current.play().catch(() => {
          // Autoplay blocked - show play button or thumbnail
        })
      }

      if (!hasStarted) {
        setHasStarted(true)
        startTimeRef.current = Date.now()
        onVideoStart()
      }

      setIsPaused(false)
      animFrameRef.current = requestAnimationFrame(updateProgress)
    } else {
      // Pause and report
      if (isYouTube) {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo' }),
          '*'
        )
      } else if (videoRef.current) {
        videoRef.current.pause()
      }

      if (hasStarted) {
        const { watchRatio, watchDuration } = getWatchMetrics()
        onVideoEnd(watchRatio, watchDuration)
        setHasStarted(false)
        setProgress(0)
      }

      cancelAnimationFrame(animFrameRef.current)
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (hasStarted) {
        const { watchRatio, watchDuration } = getWatchMetrics()
        onVideoEnd(watchRatio, watchDuration)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVideoEnded = (): void => {
    if (videoRef.current) {
      const { watchRatio, watchDuration } = getWatchMetrics()
      onVideoEnd(watchRatio, watchDuration)
      setHasStarted(false)
      // Loop for TikTok style
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
      setHasStarted(true)
      startTimeRef.current = Date.now()
      onVideoStart()
    }
  }

  const togglePause = (): void => {
    if (isYouTube) {
      const func = isPaused ? 'playVideo' : 'pauseVideo'
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func }),
        '*'
      )
    } else if (videoRef.current) {
      if (isPaused) {
        videoRef.current.play().catch(() => {})
      } else {
        videoRef.current.pause()
      }
    }
    setIsPaused(!isPaused)
  }

  const handleLike = (): void => {
    const newState: LikeState = liked === 'like' ? null : 'like'
    setLiked(newState)
    if (newState === 'like') onLike()
  }

  const handleDislike = (): void => {
    const newState: LikeState = liked === 'dislike' ? null : 'dislike'
    setLiked(newState)
    if (newState === 'dislike') onDislike()
  }

  return (
    <div className="relative w-full h-[100dvh] bg-black flex items-center justify-center overflow-hidden">
      {/* Video */}
      <div className="absolute inset-0" onClick={togglePause}>
        {isYouTube ? (
          <iframe
            ref={iframeRef}
            src={`${videoSrc}?autoplay=${isActive ? 1 : 0}&enablejsapi=1&controls=0&modestbranding=1&playsinline=1&loop=1`}
            className="w-full h-full"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            playsInline
            muted={!isActive}
            onEnded={handleVideoEnded}
            onTimeUpdate={() => {
              if (videoRef.current) {
                const ct = videoRef.current.currentTime || 0
                const dur = videoRef.current.duration || video.duration || 1
                setProgress((ct / dur) * 100)
              }
            }}
          />
        ) : (
          // Thumbnail fallback when no video source
          <div className="w-full h-full flex items-center justify-center">
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt={video.title || ''}
                className="w-full h-full object-cover"
                onError={handleThumbError}
              />
            ) : (
              <div className="text-gray-500 text-lg">No video available</div>
            )}
          </div>
        )}
      </div>

      {/* Pause indicator */}
      {isPaused && isActive && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-20 h-20 bg-black/40 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Right side action buttons */}
      <div className="absolute right-3 bottom-[180px] flex flex-col items-center gap-6 z-20">
        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              liked === 'like' ? 'bg-red-500' : 'bg-white/20 backdrop-blur-sm'
            }`}
          >
            <svg
              className="w-6 h-6 text-white"
              fill={liked === 'like' ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <span className="text-white text-xs font-medium">
            {video.like_count || 0}
          </span>
        </button>

        {/* Dislike */}
        <button onClick={handleDislike} className="flex flex-col items-center gap-1">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              liked === 'dislike' ? 'bg-gray-600' : 'bg-white/20 backdrop-blur-sm'
            }`}
          >
            <svg
              className="w-6 h-6 text-white rotate-180"
              fill={liked === 'dislike' ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
              />
            </svg>
          </div>
          <span className="text-white text-xs font-medium">
            {video.dislike_count || 0}
          </span>
        </button>

        {/* Comment count (display only) */}
        {video.comment_count > 0 && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <span className="text-white text-xs font-medium">{video.comment_count}</span>
          </div>
        )}
      </div>

      {/* Bottom overlay - video info */}
      <div className="absolute bottom-0 left-0 right-16 z-20 p-4 pb-6">
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent absolute inset-0 -top-20 pointer-events-none" />
        <div className="relative">
          {/* Channel */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {(video.channel_name || video.category || 'V')[0].toUpperCase()}
              </span>
            </div>
            <span className="text-white font-semibold text-sm">
              {video.channel_name || video.category || 'Video'}
            </span>
          </div>

          {/* Title */}
          <p className="text-white text-sm line-clamp-2 mb-2">
            {video.title || 'Untitled Video'}
          </p>

          {/* Tags */}
          {video.tags && (
            <div className="flex flex-wrap gap-1">
              {(Array.isArray(video.tags)
                ? video.tags
                : String(video.tags).split(',')
              )
                .slice(0, 3)
                .map((tag, i) => (
                  <span key={i} className="text-blue-300 text-xs">
                    #{String(tag).trim()}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-30">
        <div
          className="h-full bg-white transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
