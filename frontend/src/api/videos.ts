import client from './client'
import type { Video, FeedResponse, FeedParams, RelatedVideosResponse, CommentListResponse } from '@/types'

export const getFeed = async ({ page = 1, limit = 20 }: FeedParams = {}): Promise<FeedResponse> => {
  const response = await client.get<FeedResponse>('/feed', {
    params: { page, limit },
  })
  return response.data
}

export const getVideo = async (videoId: string): Promise<Video> => {
  const response = await client.get<Video>(`/feed/${videoId}`)
  return response.data
}

export const likeVideo = async (videoId: string): Promise<{ success: boolean }> => {
  const response = await client.post<{ success: boolean }>(`/videos/${videoId}/like`)
  return response.data
}

export const dislikeVideo = async (videoId: string): Promise<{ success: boolean }> => {
  const response = await client.post<{ success: boolean }>(`/videos/${videoId}/dislike`)
  return response.data
}

export const getRelatedVideos = async (
  videoId: string,
  limit: number = 10
): Promise<RelatedVideosResponse> => {
  const response = await client.get<RelatedVideosResponse>(`/feed/${videoId}/related`, {
    params: { limit },
  })
  return response.data
}

export const getVideoComments = async (
  videoId: string,
  page: number = 1,
  limit: number = 20,
): Promise<CommentListResponse> => {
  const response = await client.get<CommentListResponse>(`/feed/${videoId}/comments`, {
    params: { page, limit },
  })
  return response.data
}

export const getCommentReplies = async (
  videoId: string,
  commentId: string,
  page: number = 1,
  limit: number = 10,
): Promise<CommentListResponse> => {
  const response = await client.get<CommentListResponse>(
    `/feed/${videoId}/comments/${commentId}/replies`,
    { params: { page, limit } },
  )
  return response.data
}
