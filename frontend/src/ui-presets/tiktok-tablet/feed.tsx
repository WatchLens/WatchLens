/**
 * TikTok tablet feed — 4-column 9:16 grid (matches the TikTok web tablet
 * "Discover" layout). Cards mirror the mobile pattern (thumbnail with
 * overlaid play count + time-ago, avatar / handle / like row underneath)
 * with slightly larger sizing.
 *
 * Decorative TikTok elements not modeled by the platform are omitted:
 * the left navigation rail, top category chip bar, login CTA, and search
 * bar. The remaining UX is recommendation grid + click to /watch/:id.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'
import Header from '@/components/layout/Header'
import type { Video } from '@/types'

const PAGE_LIMIT = 40

const AVATAR_COLORS = ['#ff4d4f', '#ff7a45', '#ffa940', '#bae637', '#36cfc9', '#40a9ff', '#9254de', '#f759ab']

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function formatCount(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  if (day < 30) return `${Math.floor(day / 7)}w ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}mo ago`
  return `${Math.floor(mon / 12)}y ago`
}

function TabletCard({ video }: { video: Video }): JSX.Element {
  const channel = video.channel_name || video.category || 'channel'
  const thumbBase = video.resolved_url?.thumbnail_url || video.thumbnail_url
  const handle = `@${channel.toLowerCase().replace(/\s+/g, '_')}`

  return (
    <article className="cursor-pointer">
      {/* Thumbnail (9:16) with overlays */}
      <div
        className="bg-gray-200 rounded-lg overflow-hidden relative"
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
        {/* Like count badge (bottom-left, matches the TikTok web tile) */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-semibold drop-shadow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {formatCount(video.like_count)}
        </div>
        {/* Time-ago (bottom-right) */}
        {video.published_at && (
          <div className="absolute bottom-2 right-2 text-white text-[11px] drop-shadow">
            {timeAgo(video.published_at)}
          </div>
        )}
      </div>

      {/* Avatar + handle row */}
      <div className="mt-2 flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ background: avatarColor(channel) }}
        >
          {channel[0]?.toUpperCase()}
        </div>
        <span className="text-sm text-gray-700 truncate flex-1">{handle}</span>
      </div>
    </article>
  )
}

export default function TiktokTabletFeed(): JSX.Element {
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    )
  }

  return (
    <FeedSurface videos={videos}>
      <div className="min-h-screen bg-white">
        <Header />
        <main className="pt-16 px-4 pb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Recommended</h1>
          <div className="grid grid-cols-4 gap-3">
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
                    <TabletCard video={video} />
                  </VideoSurface>
                </div>
              )
            })}
          </div>

          {isLoadingMore && (
            <div className="flex justify-center py-8">
              <div className="text-gray-500 text-sm">Loading more...</div>
            </div>
          )}

          {videos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-gray-500 text-base">
                {exhausted ? 'No more videos' : 'No videos available'}
              </div>
            </div>
          )}
        </main>
      </div>
    </FeedSurface>
  )
}
