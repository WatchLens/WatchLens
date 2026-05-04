import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoTracking } from '@/hooks/useVideoTracking'
import TikTokPlayer from './TikTokPlayer'
import type { Video } from '@/types'

interface TikTokFeedProps {
  videos: Video[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  exhausted?: boolean
}

export default function TikTokFeed({
  videos,
  hasMore,
  isLoadingMore,
  onLoadMore,
  exhausted,
}: TikTokFeedProps): JSX.Element {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const tracking = useVideoTracking()

  // Detect which video is in viewport using IntersectionObserver
  const observerRef = useRef<IntersectionObserver | null>(null)
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const setVideoRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      videoRefs.current.set(index, el)
    } else {
      videoRefs.current.delete(index)
    }
  }, [])

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'))
            if (!isNaN(index)) {
              setActiveIndex(index)

              // Track impression when video enters viewport
              const video = videos[index]
              if (video) {
                tracking.trackImpression(video.video_id, index)
              }
            }
          }
        }
      },
      {
        threshold: 0.6,
      }
    )

    // Observe all video elements
    videoRefs.current.forEach((el) => {
      observerRef.current?.observe(el)
    })

    return () => {
      observerRef.current?.disconnect()
    }
  }, [videos, tracking])

  // Re-observe when videos change
  useEffect(() => {
    if (!observerRef.current) return
    observerRef.current.disconnect()
    videoRefs.current.forEach((el) => {
      observerRef.current?.observe(el)
    })
  }, [videos.length])

  // Load more when near the end
  useEffect(() => {
    if (activeIndex >= videos.length - 3 && hasMore && !isLoadingMore) {
      onLoadMore()
    }
  }, [activeIndex, videos.length, hasMore, isLoadingMore, onLoadMore])

  // Back button handler
  const handleBack = (): void => {
    navigate('/')
  }

  if (videos.length === 0) {
    return (
      <div className="h-[100dvh] bg-black flex flex-col items-center justify-center px-6 text-center">
        <div className="text-gray-300 text-lg">
          {exhausted ? 'No more videos' : 'No videos available'}
        </div>
        <p className="text-gray-500 text-sm mt-2">
          {exhausted
            ? 'You have watched every video. Please come back tomorrow.'
            : 'Please contact your experiment administrator'}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Back button (floating) */}
      <button
        onClick={handleBack}
        className="fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {videos.map((video, index) => (
        <div
          key={`${video.id}-${index}`}
          ref={(el) => setVideoRef(index, el)}
          data-index={index}
          className="h-[100dvh] w-full snap-start snap-always"
        >
          <TikTokPlayer
            video={video}
            isActive={activeIndex === index}
            onVideoStart={() => tracking.trackPlay(video.video_id, { currentTime: 0, duration: 0, playbackRate: 1 })}
            onVideoEnd={(ratio, duration) => tracking.trackVideoEnded(video.video_id, {
              duration, totalWatchedTime: duration * ratio, completionRate: ratio,
            })}
            onLike={() => tracking.trackLike(video.video_id)}
            onDislike={() => tracking.trackDislike(video.video_id)}
          />
        </div>
      ))}

      {/* Loading indicator */}
      {isLoadingMore && (
        <div className="h-[100dvh] w-full snap-start flex items-center justify-center bg-black">
          <div className="text-gray-400">Loading more...</div>
        </div>
      )}
    </div>
  )
}
