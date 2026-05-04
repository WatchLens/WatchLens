import { useState, useRef, useEffect, useCallback } from 'react'
import type { Video } from '@/types'

const THUMBNAIL_EXTENSIONS = ['jpg', 'png', 'webp'] as const

function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatViewCount(count: number | null | undefined): string {
  if (!count) return '0 views'
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`
  return `${count} views`
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}hr ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}mo ago`
  return `${Math.floor(mon / 12)}yr ago`
}

interface VideoCardProps {
  video: Video
  position: number
  /**
   * Click handler. Optional because <VideoSurface context="feed"> handles
   * click + tracking at its outer wrapper; in that case the card itself
   * doesn't need its own onClick (the wrapper's bubble fires first).
   */
  onClick?: () => void
  onVisible?: () => void
  onThumbnailHover?: (videoId: string, title: string, position: number, hoverDurationMs: number, followedByClick: boolean) => void
  /**
   * Thumbnail aspect ratio. The preset chooses — YouTube uses '16/9',
   * TikTok / Shorts use '9/16'. Defaults to '16/9' (YouTube standard).
   */
  aspectRatio?: string
  /**
   * Show a circular channel avatar to the left of title/meta. YouTube
   * preset enables this; TikTok / Shorts presets keep it off.
   */
  showChannelAvatar?: boolean
}

const AVATAR_COLORS = ['#ff4d4f', '#ff7a45', '#ffa940', '#bae637', '#36cfc9', '#40a9ff', '#9254de', '#f759ab']
function pickAvatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function VideoCard({
  video,
  position,
  onClick,
  onVisible,
  onThumbnailHover,
  aspectRatio = '16/9',
  showChannelAvatar = false,
}: VideoCardProps): JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)
  const hasTrackedRef = useRef<boolean>(false)
  const hoverStartRef = useRef<number | null>(null)
  const [extIndex, setExtIndex] = useState<number>(0)
  const [thumbnailError, setThumbnailError] = useState<boolean>(false)

  // Get thumbnail URL from resolved_url or fallback to video.thumbnail_url
  const resolvedThumb = video.resolved_url?.thumbnail_url
  const directThumb = video.thumbnail_url

  const thumbnailSrc: string | null = thumbnailError
    ? null
    : resolvedThumb
      ? resolvedThumb.includes('.')
        ? resolvedThumb
        : `${resolvedThumb}.${THUMBNAIL_EXTENSIONS[extIndex]}`
      : directThumb

  const handleThumbnailError = (): void => {
    if (resolvedThumb && !resolvedThumb.includes('.')) {
      if (extIndex < THUMBNAIL_EXTENSIONS.length - 1) {
        setExtIndex((i) => i + 1)
      } else {
        setThumbnailError(true)
      }
    } else {
      setThumbnailError(true)
    }
  }

  // Intersection observer for impression tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasTrackedRef.current) {
          hasTrackedRef.current = true
          onVisible?.()
        }
      },
      { threshold: 0.5 }
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => observer.disconnect()
  }, [onVisible])

  // Hover tracking
  const handleMouseEnter = useCallback(() => {
    hoverStartRef.current = Date.now()
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverStartRef.current && onThumbnailHover) {
      const duration = Date.now() - hoverStartRef.current
      if (duration > 200) {  // Only track hovers > 200ms to filter noise
        onThumbnailHover(video.video_id, video.title || '', position, duration, false)
      }
    }
    hoverStartRef.current = null
  }, [video.video_id, video.title, position, onThumbnailHover])

  const handleClick = useCallback(() => {
    // Record hover that ended with a click
    if (hoverStartRef.current && onThumbnailHover) {
      const duration = Date.now() - hoverStartRef.current
      onThumbnailHover(video.video_id, video.title || '', position, duration, true)
      hoverStartRef.current = null
    }
    onClick?.()
  }, [video.video_id, video.title, position, onThumbnailHover, onClick])

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="cursor-pointer group"
      data-video-id={video.video_id}
      data-position={position}
    >
      {/* Thumbnail */}
      <div className="relative bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden" style={{ aspectRatio }}>
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt={video.title || 'Video thumbnail'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            onError={handleThumbnailError}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
            <svg
              className="w-16 h-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-medium px-1 py-0.5 rounded">
            {formatDuration(video.duration)}
          </div>
        )}
      </div>

      {/* Video info */}
      <div className={`mt-2 ${showChannelAvatar ? 'flex gap-2' : ''}`}>
        {showChannelAvatar && (
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
            style={{ background: pickAvatarColor(video.channel_name || video.category || 'V') }}
          >
            {(video.channel_name || video.category || 'V')[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-5">
            {video.title || 'Untitled Video'}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {video.channel_name || video.category || 'Video'}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {formatViewCount(video.view_count)} · {timeAgo(video.published_at)}
          </p>
        </div>
      </div>
    </div>
  )
}
