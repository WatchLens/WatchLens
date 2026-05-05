import { useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getVideoComments, getCommentReplies } from '@/api/videos'
import type { Comment, CommentListResponse } from '@/types'
import { useMockData } from './mockContext'

const DEFAULT_PAGE_SIZE = 20
const DEFAULT_REPLIES_PAGE_SIZE = 10

export interface UseCommentsOptions {
  pageSize?: number
  enabled?: boolean
}

export interface UseCommentsResult {
  comments: Comment[]
  total: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: Error | null
  loadMore: () => void
}

export function useComments(
  videoId: string | undefined,
  opts: UseCommentsOptions = {},
): UseCommentsResult {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE
  const mock = useMockData()
  const enabled = (opts.enabled ?? true) && !!videoId && mock === null

  const query = useInfiniteQuery<CommentListResponse>({
    queryKey: ['comments', videoId, pageSize],
    queryFn: ({ pageParam }) =>
      getVideoComments(videoId!, pageParam as number, pageSize),
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    initialPageParam: 1,
    enabled,
  })

  if (mock !== null) {
    const list = mock.comments ?? []
    return {
      comments: list,
      total: list.length,
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      loadMore: () => {},
    }
  }

  const comments = useMemo(
    () => query.data?.pages.flatMap((p) => p.comments) ?? [],
    [query.data],
  )

  const total = query.data?.pages[0]?.total ?? 0

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query])

  return {
    comments,
    total,
    hasMore: !!query.hasNextPage,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
  }
}

// ── Replies (sibling hook so the comments tree is fully accessible) ──

export interface UseRepliesOptions {
  pageSize?: number
  enabled?: boolean
}

export interface UseRepliesResult {
  replies: Comment[]
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: Error | null
  loadMore: () => void
}

export function useReplies(
  videoId: string | undefined,
  commentId: string | undefined,
  opts: UseRepliesOptions = {},
): UseRepliesResult {
  const pageSize = opts.pageSize ?? DEFAULT_REPLIES_PAGE_SIZE
  const mock = useMockData()
  const enabled = (opts.enabled ?? true) && !!videoId && !!commentId && mock === null

  const query = useInfiniteQuery<CommentListResponse>({
    queryKey: ['replies', videoId, commentId, pageSize],
    queryFn: ({ pageParam }) =>
      getCommentReplies(videoId!, commentId!, pageParam as number, pageSize),
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    initialPageParam: 1,
    enabled,
  })

  if (mock !== null) {
    return {
      replies: [],
      hasMore: false,
      isLoading: false,
      isLoadingMore: false,
      error: null,
      loadMore: () => {},
    }
  }

  const replies = useMemo(
    () => query.data?.pages.flatMap((p) => p.comments) ?? [],
    [query.data],
  )

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage()
    }
  }, [query])

  return {
    replies,
    hasMore: !!query.hasNextPage,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error,
    loadMore,
  }
}
