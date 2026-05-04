/**
 * TikTok desktop-style split-screen watch view.
 *
 * Left  ~60%: 9:16 video, full-height, centered.
 * Right ~40%: channel info + caption + horizontal action stack
 *             (Like, Comment) + tabbed panel (Comments / Related).
 *
 * Mirrors TikTok's desktop watch URL layout. Bookmark / share / music /
 * dislike are intentionally omitted: they don't map to platform-tracked
 * events or aren't part of TikTok's surface (TikTok has no dislike).
 *
 * The "Related" tab is what TikTok labels "creator videos"; we substitute
 * `useRelated()` (algorithm-driven recommendations) since the platform
 * doesn't expose a per-channel feed endpoint.
 */
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useVideo, useRelated, useLikes, useComments } from '@/ui-runtime/data'
import { WatchSurface, VideoSurface } from '@/ui-runtime/surfaces'
import VideoPlayer from '@/components/video/VideoPlayer'

type RightTab = 'comments' | 'related'

function avatarColor(name: string): string {
  const colors = ['#ff4d4f', '#ff7a45', '#ffa940', '#bae637', '#36cfc9', '#40a9ff', '#9254de', '#f759ab']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return colors[Math.abs(h) % colors.length]
}

export default function TiktokWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const { video, isLoading, error } = useVideo(videoId)
  const { videos: related } = useRelated(videoId, { limit: 12 })
  const likes = useLikes(videoId, { initialCount: video?.like_count })
  const { comments, total: totalComments, hasMore, loadMore, isLoadingMore } = useComments(videoId)
  const [tab, setTab] = useState<RightTab>('comments')

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
  const channelName = video.channel_name || video.category || 'channel'

  return (
    <WatchSurface video={video} relatedVideos={related}>
      <div className="h-screen bg-black flex overflow-hidden">
        {/* ── Left: 9:16 video, vertically centered ── */}
        <div className="flex-1 flex items-center justify-center relative px-4">
          <button
            onClick={() => navigate('/')}
            className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur text-white flex items-center justify-center hover:bg-black/60"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div
            className="bg-black rounded-xl overflow-hidden h-full max-h-[calc(100vh-32px)]"
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
          </div>
        </div>

        {/* ── Right: meta + horizontal actions + tabbed panel ── */}
        <div className="flex-1 max-w-[720px] bg-white dark:bg-[#121212] text-gray-900 dark:text-gray-100 flex flex-col overflow-hidden border-l border-gray-200 dark:border-gray-800">
          {/* Channel + caption + actions */}
          <div className="p-5 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold"
                style={{ background: avatarColor(channelName) }}
              >
                {channelName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{channelName}</div>
                <div className="text-xs text-gray-500 truncate">
                  @{channelName.toLowerCase().replace(/\s+/g, '_')}
                </div>
              </div>
            </div>

            {video.title && (
              <p className="mt-3 text-sm leading-relaxed">{video.title}</p>
            )}

            {video.tags && (
              <div className="mt-1 flex flex-wrap gap-x-2">
                {(Array.isArray(video.tags) ? video.tags : String(video.tags).split(','))
                  .map((t, i) => (
                    <span key={i} className="text-sm text-blue-600 dark:text-blue-400">
                      #{String(t).trim()}
                    </span>
                  ))}
              </div>
            )}

            {/* Horizontal action stack — Like, Comment only */}
            <div className="mt-5 flex items-center gap-4">
              <button onClick={likes.like} className="flex flex-col items-center gap-1 group">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                  likes.isLiked
                    ? 'bg-red-100 dark:bg-red-900/40 text-red-500'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'
                }`}>
                  <svg width="20" height="20" viewBox="0 0 24 24"
                    fill={likes.isLiked ? 'currentColor' : 'none'}
                    stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold">{likes.count}</span>
              </button>

              <button
                onClick={() => setTab('comments')}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 group-hover:bg-gray-200 dark:group-hover:bg-gray-700">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold">{totalComments || video.comment_count || 0}</span>
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setTab('comments')}
              className={`flex-1 px-5 py-3 text-sm font-semibold border-b-2 transition ${
                tab === 'comments'
                  ? 'border-current text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Comments <span className="text-gray-500 font-normal ml-1">({totalComments})</span>
            </button>
            <button
              onClick={() => setTab('related')}
              className={`flex-1 px-5 py-3 text-sm font-semibold border-b-2 transition ${
                tab === 'related'
                  ? 'border-current text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Related
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'comments' ? (
              <div className="px-5 py-3">
                {comments.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">No comments</div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((c) => (
                      <div key={c.id} className="flex gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold"
                          style={{ background: avatarColor(c.author_name) }}
                        >
                          {(c.author_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            {c.author_name}
                          </div>
                          <div className="text-sm mt-0.5 leading-relaxed">{c.text}</div>
                          {c.like_count > 0 && (
                            <div className="text-xs text-gray-500 mt-1">♡ {c.like_count}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="mt-4 w-full py-2 text-center text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Loading...' : 'More comments'}
                  </button>
                )}
              </div>
            ) : (
              /* Related videos tab */
              <div className="px-3 py-3">
                {related.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">No related videos</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {related.map((rv, i) => {
                      const thumb = rv.resolved_url?.thumbnail_url || rv.thumbnail_url
                      return (
                        <VideoSurface
                          key={rv.id}
                          video={rv}
                          position={i}
                          context="related"
                          onClick={() => navigate(`/watch/${rv.video_id}`)}
                        >
                          <div className="cursor-pointer group">
                            <div
                              className="bg-gray-200 dark:bg-gray-800 rounded-md overflow-hidden relative"
                              style={{ aspectRatio: '9/16' }}
                            >
                              {thumb && (
                                <img
                                  src={thumb.includes('.') ? thumb : `${thumb}.jpg`}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const img = e.currentTarget
                                    if (img.src.endsWith('.jpg')) img.src = thumb + '.png'
                                    else if (img.src.endsWith('.png')) img.src = thumb + '.webp'
                                    else img.style.display = 'none'
                                  }}
                                />
                              )}
                              <div className="absolute bottom-1 left-1 text-white text-[10px] flex items-center gap-1 bg-black/40 px-1 rounded">
                                ▶ {(rv.view_count || 0).toLocaleString()}
                              </div>
                            </div>
                            <div className="mt-1 px-0.5">
                              <div className="text-xs font-medium line-clamp-2 leading-tight">
                                {rv.title || 'Untitled'}
                              </div>
                              <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                @{(rv.channel_name || rv.category || '').toLowerCase().replace(/\s+/g, '_')}
                              </div>
                            </div>
                          </div>
                        </VideoSurface>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </WatchSurface>
  )
}
