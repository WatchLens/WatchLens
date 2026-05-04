import { useQuery } from '@tanstack/react-query'
import { getVideo } from '@/api/videos'
import type { Video } from '@/types'

export interface UseVideoResult {
  video: Video | undefined
  isLoading: boolean
  error: Error | null
}

export function useVideo(videoId: string | undefined): UseVideoResult {
  const query = useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: () => getVideo(videoId!),
    enabled: !!videoId,
  })

  return {
    video: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
