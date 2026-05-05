import { useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getFeed } from '@/api/videos'
import type { FeedResponse, Video } from '@/types'
import { useMockData } from './mockContext'

const DEFAULT_LIMIT = 40

export interface UseFeedOptions {
  limit?: number
}

export interface UseFeedResult {
  videos: Video[]
  algorithm: string
  hasMore: boolean
  exhausted: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: Error | null
  loadMore: () => void
}

export function useFeed(opts: UseFeedOptions = {}): UseFeedResult {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const mock = useMockData()

  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ['feed', limit],
    queryFn: ({ pageParam }) => getFeed({ page: pageParam as number, limit }),
    getNextPageParam: (last, _all, lastPageParam) =>
      last.has_more ? (lastPageParam as number) + 1 : undefined,
    initialPageParam: 1,
    staleTime: Infinity,
    // Mock-mode preview short-circuits real network calls; the hook
    // still mounts (so React's hook-order invariant holds) but the API
    // is never hit and the return value below substitutes the mock.
    enabled: mock === null,
  })

  if (mock !== null) {
    const sliced = mock.feed.slice(0, limit)
    return {
      videos: sliced,
      algorithm: 'mock',
      hasMore: false,
      exhausted: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      loadMore: () => {},
    }
  }

  const videos = useMemo(
    () => query.data?.pages.flatMap((p) => p.videos) ?? [],
    [query.data],
  )

  const algorithm = query.data?.pages[0]?.algorithm ?? ''
  const exhausted = !!query.data?.pages.some((p) => p.exhausted)

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query])

  return {
    videos,
    algorithm,
    hasMore: !!query.hasNextPage,
    exhausted,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
  }
}
