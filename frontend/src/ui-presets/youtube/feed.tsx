/**
 * YouTube-classic feed: header + responsive thumbnail grid (2/3/4/5 cols
 * depending on viewport) + infinite scroll.
 *
 * Authored entirely against the standardized contract — `useFeed` for
 * data, `<FeedSurface>` for page-level events, `<VideoSurface>` for
 * per-card events. The preset only describes layout and visual style;
 * tracking, algorithm dispatch, and data plumbing are handled below the
 * contract.
 *
 * LAYOUT_CHANGE is intentionally not emitted from this preset (no
 * user-controlled column toggle). It remains a manual-emit event in the
 * schema for presets / custom UIs that expose layout-changing controls.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'
import Header from '@/components/layout/Header'
import VideoCard from '@/components/video/VideoCard'

const PAGE_LIMIT = 40

export default function YoutubeFeed(): JSX.Element {
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
        <div className="text-red-500">Error loading feed: {error.message}</div>
      </div>
    )
  }

  return (
    <FeedSurface videos={videos}>
      <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
        <Header />
        <main className="pt-14">
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
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
                      <VideoCard video={video} position={index} showChannelAvatar />
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
                <p className="text-gray-400 dark:text-gray-500 mt-2">
                  {exhausted
                    ? 'You have watched every video. Please come back tomorrow.'
                    : 'Please contact your experiment administrator'}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </FeedSurface>
  )
}
