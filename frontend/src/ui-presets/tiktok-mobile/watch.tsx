/**
 * TikTok mobile watch — full-screen 9:16 video with right-side action
 * stack overlay and bottom-left meta overlay (TikTok mobile web pattern).
 * Scrolling below the fold reveals a 2-column related-video grid; the
 * comment icon opens a bottom-sheet modal with the comment thread.
 *
 * Decorative TikTok elements that the platform doesn't model are
 * omitted: top brand bar, "open app" CTA, mute toggle (the bundled
 * <VideoPlayer> exposes its own controls), share button, music icon,
 * follow button, and the algorithmic / channel / hashtag tab bar above
 * related videos (we collapse to "More videos" since the platform
 * surfaces a single recommendation list).
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useVideo, useRelated, useLikes, useComments } from '@/ui-runtime/data'
import { WatchSurface, VideoSurface } from '@/ui-runtime/surfaces'
import VideoPlayer from '@/components/video/VideoPlayer'
import CommentSection from '@/components/video/CommentSection'
import type { Video } from '@/types'

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

interface RelatedCardProps {
  video: Video
}

function RelatedCard({ video }: RelatedCardProps): JSX.Element {
  const channel = video.channel_name || video.category || 'channel'
  const thumbBase = video.resolved_url?.thumbnail_url || video.thumbnail_url
  const handle = `@${channel.toLowerCase().replace(/\s+/g, '_')}`

  return (
    <article className="cursor-pointer">
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
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-[11px] font-semibold drop-shadow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {formatCount(video.view_count)}
        </div>
        {video.published_at && (
          <div className="absolute bottom-1.5 right-1.5 text-white text-[10px] drop-shadow">
            {timeAgo(video.published_at)}
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold"
          style={{ background: avatarColor(channel) }}
        >
          {channel[0]?.toUpperCase()}
        </div>
        <span className="text-xs text-gray-700 truncate flex-1">{handle}</span>
        <span className="flex items-center gap-1 text-[11px] text-gray-500">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {formatCount(video.like_count)}
        </span>
      </div>
    </article>
  )
}

export default function TiktokMobileWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const { video, isLoading, error } = useVideo(videoId)
  const { videos: related } = useRelated(videoId, { limit: 12 })
  const likes = useLikes(videoId, { initialCount: video?.like_count })
  const { total: totalComments } = useComments(videoId)
  const [commentsOpen, setCommentsOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    )
  }
  if (error || !video) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-red-400">Video not found</div>
      </div>
    )
  }

  const playerSrc = video.resolved_url?.video_url || video.url
  const channel = video.channel_name || video.category || 'channel'
  const handle = `@${channel.toLowerCase().replace(/\s+/g, '_')}`

  return (
    <WatchSurface video={video} relatedVideos={related}>
      <div className="bg-white min-h-screen">
        {/* ── Above the fold: full-screen 9:16 video with overlays ── */}
        <div className="relative bg-black w-full overflow-hidden" style={{ aspectRatio: '9/16' }}>
          <VideoSurface video={video} context="watch">
            {(handlers) =>
              playerSrc ? (
                <VideoPlayer src={playerSrc} {...handlers} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No video source
                </div>
              )
            }
          </VideoSurface>

          {/* Back button (top-left) */}
          <button
            onClick={() => navigate('/')}
            className="absolute top-3 left-3 z-20 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Right action stack (avatar, like, comment) */}
          <div className="absolute right-2 bottom-28 z-20 flex flex-col items-center gap-5">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ring-2 ring-white"
              style={{ background: avatarColor(channel) }}
              aria-label="Channel"
            >
              {channel[0]?.toUpperCase()}
            </div>
            <button
              onClick={likes.like}
              className="flex flex-col items-center gap-1"
              aria-label="Like"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill={likes.isLiked ? '#ff4444' : 'white'}
                stroke="white"
                strokeWidth="1.5"
                className="drop-shadow-lg"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="text-white text-[11px] font-semibold drop-shadow">
                {formatCount(likes.count)}
              </span>
            </button>
            <button
              onClick={() => setCommentsOpen(true)}
              className="flex flex-col items-center gap-1"
              aria-label="Comments"
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="white"
                className="drop-shadow-lg"
              >
                <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
              </svg>
              <span className="text-white text-[11px] font-semibold drop-shadow">
                {formatCount(totalComments || video.comment_count || 0)}
              </span>
            </button>
          </div>

          {/* Bottom-left meta overlay */}
          <div className="absolute left-0 right-16 bottom-0 z-10 p-3 pb-4 bg-gradient-to-t from-black/70 via-black/40 to-transparent">
            <div className="text-white font-semibold text-sm mb-1">{handle}</div>
            {video.title && (
              <p className="text-white text-xs leading-relaxed line-clamp-3">
                {video.title}
              </p>
            )}
            {video.tags && (
              <div className="mt-1 flex flex-wrap gap-x-1.5">
                {(Array.isArray(video.tags) ? video.tags : String(video.tags).split(','))
                  .slice(0, 4)
                  .map((tag, i) => (
                    <span key={i} className="text-blue-300 text-xs">
                      #{String(tag).trim()}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Below the fold: more videos grid ── */}
        <section className="px-3 py-4">
          <h2 className="text-base font-bold text-gray-900 mb-3">More videos</h2>
          {related.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">No related videos</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {related.map((rv, i) => (
                <VideoSurface
                  key={rv.id}
                  video={rv}
                  position={i}
                  context="related"
                  onClick={() => navigate(`/watch/${rv.video_id}`)}
                >
                  <RelatedCard video={rv} />
                </VideoSurface>
              ))}
            </div>
          )}
        </section>

        {/* ── Comments bottom-sheet modal ── */}
        {commentsOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setCommentsOpen(false)}
          >
            <div
              className="bg-white w-full rounded-t-2xl max-h-[75vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-sm">
                  Comments <span className="text-gray-500 font-normal ml-1">{formatCount(totalComments || 0)}</span>
                </span>
                <button
                  onClick={() => setCommentsOpen(false)}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="px-4 pb-4">
                <CommentSection
                  videoId={video.video_id}
                  commentCount={video.comment_count}
                  defaultExpanded
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </WatchSurface>
  )
}
