/**
 * 9:16 thumbnail grid feed shared by tiktok and shorts presets.
 *
 * Both presets render identical grid layouts; their watch-page
 * differentiation handles the actual UX divergence (TikTok pager vs
 * Shorts split-screen). Keeping the grid here avoids drift between two
 * "same shape" feeds.
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFeed } from '@/ui-runtime/data'
import { FeedSurface, VideoSurface } from '@/ui-runtime/surfaces'
import Header from '@/components/layout/Header'
import VideoCard from '@/components/video/VideoCard'

const PAGE_LIMIT = 40

export default function Grid169Feed(): JSX.Element {
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
          <div className="p-6">
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
                      <VideoCard video={video} position={index} aspectRatio="9/16" />
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
