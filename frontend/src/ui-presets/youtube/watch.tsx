/**
 * YouTube-classic watch page: aspect-video player + 16:9 sidebar of
 * related cards, comments below the player.
 *
 * All event tracking comes through the surfaces; the preset only owns
 * layout and visual style. Synthetic VIDEO_ENDED on unmount-mid-play is
 * handled inside <VideoSurface context="watch">, so the preset doesn't
 * track playback state itself.
 */
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useVideo, useRelated, useLikes } from '@/ui-runtime/data'
import { WatchSurface, VideoSurface } from '@/ui-runtime/surfaces'
import Header from '@/components/layout/Header'
import VideoPlayer from '@/components/video/VideoPlayer'
import CommentSection from '@/components/video/CommentSection'
import type { Video, ResolvedUrl } from '@/types'

const THUMBNAIL_EXTENSIONS = ['jpg', 'png', 'webp'] as const

interface RelatedThumbnailProps {
  video: Video
  resolved: ResolvedUrl | null
}

function RelatedThumbnail({ video, resolved }: RelatedThumbnailProps): JSX.Element {
  const [extIndex, setExtIndex] = useState<number>(0)
  const [error, setError] = useState<boolean>(false)
  const thumbBase = resolved?.thumbnail_url || video.thumbnail_url
  const thumbnailSrc: string | null = error
    ? null
    : thumbBase
      ? thumbBase.includes('.')
        ? thumbBase
        : `${thumbBase}.${THUMBNAIL_EXTENSIONS[extIndex]}`
      : null

  const handleError = (): void => {
    if (thumbBase && !thumbBase.includes('.')) {
      if (extIndex < THUMBNAIL_EXTENSIONS.length - 1) {
        setExtIndex((i) => i + 1)
      } else {
        setError(true)
      }
    } else {
      setError(true)
    }
  }

  if (!thumbnailSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={thumbnailSrc}
      alt={video.title || 'Video thumbnail'}
      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
      onError={handleError}
    />
  )
}

interface ExpandableDescriptionProps {
  text: string
  viewCount: number | null | undefined
  publishedAt: string | null
}

function ExpandableDescription({ text, viewCount, publishedAt }: ExpandableDescriptionProps): JSX.Element {
  const [expanded, setExpanded] = useState<boolean>(false)
  const meta: string[] = []
  if (viewCount != null) meta.push(`${viewCount.toLocaleString()} views`)
  if (publishedAt) {
    const d = new Date(publishedAt)
    if (!isNaN(d.getTime())) {
      meta.push(d.toLocaleDateString())
    }
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="mt-4 w-full text-left p-3 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    >
      {meta.length > 0 && (
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          {meta.join(' · ')}
        </div>
      )}
      <p
        className={`text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {text}
      </p>
      <span className="mt-2 inline-block text-xs font-semibold text-gray-700 dark:text-gray-300">
        {expanded ? 'Show less' : '...Show more'}
      </span>
    </button>
  )
}

export default function YoutubeWatch(): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { video, isLoading, error } = useVideo(videoId)
  const { videos: related } = useRelated(videoId, { limit: 12 })
  const likes = useLikes(videoId, { initialCount: video?.like_count })

  const goToFeed = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    navigate('/')
  }, [navigate, queryClient])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">Video not found</div>
        <button onClick={goToFeed} className="text-blue-500 hover:text-blue-400">
          Back to feed
        </button>
      </div>
    )
  }

  const resolved = video.resolved_url || null
  const playerSrc = resolved?.video_url || video.url

  return (
    <WatchSurface video={video} relatedVideos={related}>
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
        <Header />
        <main className="pt-14">
          <div className="max-w-[1800px] mx-auto flex flex-col lg:flex-row gap-6 p-4 lg:p-6">
            {/* Main column */}
            <div className="flex-1 min-w-0">
              {/* Player */}
              <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
                <VideoSurface video={video} context="watch">
                  {(handlers) =>
                    playerSrc ? (
                      <VideoPlayer src={playerSrc} {...handlers} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        No video source available
                      </div>
                    )
                  }
                </VideoSurface>
              </div>

              {/* Title + actions */}
              <div className="mt-3">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {video.title || 'Untitled Video'}
                </h1>

                <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pb-3 border-b border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    {video.view_count > 0 && <span>{video.view_count} views</span>}
                    {video.category && (
                      <>
                        <span>&middot;</span>
                        <span>{video.category}</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full">
                    <button
                      onClick={likes.like}
                      className={`flex items-center gap-2 px-4 py-2 rounded-l-full transition-colors ${
                        likes.isLiked
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg className="w-5 h-5" fill={likes.isLiked ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                      </svg>
                      <span className="text-sm font-medium">Like</span>
                    </button>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />
                    <button
                      onClick={likes.dislike}
                      className={`flex items-center gap-2 px-4 py-2 rounded-r-full transition-colors ${
                        likes.isDisliked
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg className="w-5 h-5 rotate-180"
                        fill={likes.isDisliked ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Channel */}
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {(video.channel_name || video.category || 'V')[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {video.channel_name || video.category || 'Video'}
                  </div>
                </div>

                {video.description && (
                  <ExpandableDescription
                    text={video.description}
                    viewCount={video.view_count}
                    publishedAt={video.published_at}
                  />
                )}

                {video.tags && (
                  <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-xl">
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(video.tags) ? video.tags : String(video.tags).split(',')).map((tag, i) => (
                        <span key={i} className="text-sm text-blue-600 dark:text-blue-400">
                          #{String(tag).trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <CommentSection
                  videoId={video.video_id}
                  commentCount={video.comment_count}
                  defaultExpanded
                />
              </div>
            </div>

            {/* Related sidebar */}
            <div className="lg:w-[400px] flex-shrink-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                Related Videos
              </div>
              <div className="space-y-3">
                {related.map((rv, i) => {
                  const rvResolved = rv.resolved_url || null
                  return (
                    <VideoSurface
                      key={rv.id}
                      video={rv}
                      position={i}
                      context="related"
                      onClick={() => navigate(`/watch/${rv.video_id}`)}
                    >
                      <div className="flex gap-2 cursor-pointer group">
                        <div className="w-[168px] h-[94px] flex-shrink-0 bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden">
                          <RelatedThumbnail video={rv} resolved={rvResolved} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {rv.title || 'Untitled'}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {rv.channel_name || rv.category || 'Video'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {rv.view_count || 0} views
                          </p>
                        </div>
                      </div>
                    </VideoSurface>
                  )
                })}
                {related.length === 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    No related videos found
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </WatchSurface>
  )
}
