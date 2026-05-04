import { useQuery } from '@tanstack/react-query'
import { getRelatedVideos } from '@/api/videos'
import type { RelatedVideosResponse, Video } from '@/types'

const DEFAULT_LIMIT = 12

export interface UseRelatedOptions {
  limit?: number
}

export interface UseRelatedResult {
  videos: Video[]
  algorithm: string
  isLoading: boolean
  error: Error | null
}

export function useRelated(
  videoId: string | undefined,
  opts: UseRelatedOptions = {},
): UseRelatedResult {
  const limit = opts.limit ?? DEFAULT_LIMIT

  const query = useQuery<RelatedVideosResponse>({
    queryKey: ['relatedVideos', videoId, limit],
    queryFn: () => getRelatedVideos(videoId!, limit),
    enabled: !!videoId,
  })

  return {
    videos: query.data?.videos ?? [],
    algorithm: query.data?.algorithm ?? '',
    isLoading: query.isLoading,
    error: query.error,
  }
}
