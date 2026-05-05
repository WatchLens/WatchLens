/**
 * TikTok tablet watch — split-screen with the 9:16 player on the left
 * (with overlaid right action stack and bottom-left meta, matching the
 * TikTok mobile web watch URL pattern) and a tabbed panel on the right
 * (Comments / Related). The Related tab renders a 2-column 9:16 grid
 * mirroring the screenshot the admin verified against.
 *
 * Decorative TikTok elements not modeled by the platform are omitted:
 * left navigation rail, top brand bar, login CTA, mute toggle (the
 * bundled <VideoPlayer> exposes its own controls), share, bookmark,
 * follow `+` overlay, music attribution, and the "filter" badge.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useVideo, useRelated, useLikes, useComments } from '@/ui-runtime/data'
import { WatchSurface, VideoSurface } from '@/ui-runtime/surfaces'
import VideoPlayer from '@/components/video/VideoPlayer'
import CommentSection from '@/components/video/CommentSection'
import type { Video } from '@/types'

type RightTab = 'comments' | 'related'

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

function RelatedCard({ video }: { video: Video }): JSX.Element {
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
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {formatCount(video.like_count)}
        </div>
        {video.published_at && (
          <div className="absolute bottom-1.5 right-1.5 text-white text-[10px] drop-shadow">
            {timeAgo(video.published_at)}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <div
          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
          style={{ background: avatarColor(channel) }}
        >
          {channel[0]?.toUpperCase()}
        </div>
        <span className="text-[11px] text-gray-700 truncate flex-1">{handle}</span>
      </div>
    </article>
  )
}

export default function TiktokTabletWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const { video, isLoading, error } = useVideo(videoId)
  const { videos: related } = useRelated(videoId, { limit: 12 })
  const likes = useLikes(videoId, { initialCount: video?.like_count })
  const { total: totalComments } = useComments(videoId)
  const [tab, setTab] = useState<RightTab>('related')

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
      <div className="h-screen bg-white flex overflow-hidden">
        {/* ── Left: 9:16 video with right action stack and bottom meta ── */}
        <div className="flex-1 flex items-center justify-center bg-black relative px-3 py-3">
          <button
            onClick={() => navigate('/')}
            className="absolute top-4 left-4 z-30 w-9 h-9 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div
            className="relative bg-black rounded-xl overflow-hidden h-full max-h-[calc(100vh-24px)]"
            style={{ aspectRatio: '9/16' }}
          >
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

            {/* Right action stack overlay */}
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
                onClick={() => setTab('comments')}
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
              <div className="flex items-center gap-2 text-white text-sm font-semibold">
                <span>{handle}</span>
                {video.published_at && (
                  <>
                    <span className="text-white/60 text-xs">·</span>
                    <span className="text-white/80 text-xs font-normal">{timeAgo(video.published_at)}</span>
                  </>
                )}
              </div>
              {video.title && (
                <p className="mt-1 text-white text-xs leading-relaxed line-clamp-2">
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
        </div>

        {/* ── Right: tabbed panel (Comments / Related, 2-col grid) ── */}
        <div className="w-[420px] flex-shrink-0 flex flex-col overflow-hidden border-l border-gray-200">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setTab('comments')}
              className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition ${
                tab === 'comments'
                  ? 'border-current text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Comments <span className="text-gray-500 font-normal ml-1">({formatCount(totalComments || 0)})</span>
            </button>
            <button
              onClick={() => setTab('related')}
              className={`flex-1 px-4 py-3 text-sm font-semibold border-b-2 transition ${
                tab === 'related'
                  ? 'border-current text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Related
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === 'comments' ? (
              <div className="px-4 py-3">
                <CommentSection
                  videoId={video.video_id}
                  commentCount={video.comment_count}
                  defaultExpanded
                />
              </div>
            ) : related.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No related videos</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-3">
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
          </div>
        </div>
      </div>
    </WatchSurface>
  )
}
