/**
 * TikTok-style feed: 9:16 thumbnail grid with channel-+-likes overlay
 * card style. No left nav rail, no top category tabs (out of scope for
 * this preset's UX claim — researchers can re-add them by writing a
 * new preset).
 *
 * The shared 9:16 grid (`_shared/Grid169Feed`) used by the shorts preset
 * uses the bundled `<VideoCard>` (title-below + meta-below). TikTok's
 * desktop feed instead emphasizes the thumbnail with the channel +
 * like-count drawn underneath in a tighter layout. We render that
 * inline rather than parameterizing VideoCard so the preset stays
 * self-contained.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'
import Header from '@/components/layout/Header'
import type { Video } from '@/types'

const PAGE_LIMIT = 40

function avatarColor(name: string): string {
  const colors = ['#ff4d4f', '#ff7a45', '#ffa940', '#bae637', '#36cfc9', '#40a9ff', '#9254de', '#f759ab']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

function formatCount(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function TikTokCard({ video }: { video: Video }): JSX.Element {
  const channel = video.channel_name || video.category || 'channel'
  const thumbBase = video.resolved_url?.thumbnail_url || video.thumbnail_url

  return (
    <article className="cursor-pointer">
      {/* Thumbnail */}
      <div
        className="bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden relative"
        style={{ aspectRatio: '9/16' }}
      >
        {thumbBase && (
          <img
            src={thumbBase.includes('.') ? thumbBase : `${thumbBase}.jpg`}
            alt={video.title || ''}
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget
              if (!thumbBase.includes('.')) {
                if (img.src.endsWith('.jpg')) img.src = `${thumbBase}.png`
                else if (img.src.endsWith('.png')) img.src = `${thumbBase}.webp`
                else img.style.display = 'none'
              } else {
                img.style.display = 'none'
              }
            }}
          />
        )}
        {/* Bottom overlay: caption (line-clamped) above the play count
            badge. Both share the same gradient so they read as a single
            unit and never overlap. */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pt-6 pb-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col gap-1">
          {video.title && (
            <div className="text-white text-xs font-medium line-clamp-2 leading-snug">
              {video.title}
            </div>
          )}
          <div className="flex items-center gap-1 text-white/90 text-[11px]">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            {formatCount(video.view_count)}
          </div>
        </div>
      </div>

      {/* Channel + likes row (under the card) */}
      <div className="mt-1.5 px-0.5 flex items-center gap-1.5">
        <div
          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: avatarColor(channel) }}
        >
          {channel[0]?.toUpperCase()}
        </div>
        <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
          @{channel.toLowerCase().replace(/\s+/g, '_')}
        </span>
        <span className="flex items-center gap-0.5 text-[11px] text-gray-500">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {formatCount(video.like_count)}
        </span>
      </div>
    </article>
  )
}

export default function TiktokFeed(): JSX.Element {
  const navigate = useNavigate()
  const { videos, hasMore, loadMore, isLoading, isLoadingMore, exhausted, error } = useFeed({ limit: PAGE_LIMIT })

  const lastCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !hasMore || isLoadingMore) return
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
          observer.disconnect()
        }
      })
      observer.observe(node)
    },
    [hasMore, isLoadingMore, loadMore],
  )

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    )
  }

  return (
    <FeedSurface videos={videos}>
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
        <Header />
        <main className="pt-14">
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {videos.map((video, index) => {
                const isLast = index === videos.length - 1
                return (
                  <div key={video.id} ref={isLast ? lastCardRef : undefined}>
                    <VideoSurface
                      video={video}
                      position={index}
                      context="feed"
                      onClick={() => navigate(`/watch/${video.video_id}`)}
                    >
                      <TikTokCard video={video} />
                    </VideoSurface>
                  </div>
                )
              })}
            </div>

            {isLoadingMore && (
              <div className="flex justify-center py-8">
                <div className="text-gray-500 dark:text-gray-400">Loading more...</div>
              </div>
            )}

            {videos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-gray-500 dark:text-gray-400 text-lg">
                  {exhausted ? 'No more videos' : 'No videos available'}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </FeedSurface>
  )
}
