import { useQuery } from '@tanstack/react-query'
import { getVideo } from '@/api/videos'
import type { Video } from '@/types'
import { useMockData } from './mockContext'

export interface UseVideoResult {
  video: Video | undefined
  isLoading: boolean
  error: Error | null
}

export function useVideo(videoId: string | undefined): UseVideoResult {
  const mock = useMockData()
  const query = useQuery<Video>({
    queryKey: ['video', videoId],
    queryFn: () => getVideo(videoId!),
    enabled: !!videoId && mock === null,
  })

  if (mock !== null) {
    return { video: mock.pageVideo, isLoading: false, error: null }
  }

  return {
    video: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
