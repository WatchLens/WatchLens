export type VideoUrlType = 'youtube' | 'direct' | 'local'

export interface ResolvedUrl {
  type: VideoUrlType
  video_url: string | null
  embed_url: string | null
  thumbnail_url: string | null
}

export interface Video {
  id: number
  video_id: string
  title: string | null
  url: string
  resolved_url: ResolvedUrl | null
  thumbnail_url: string | null
  video_type: string | null
  duration: number | null
  category: string | null
  tags: string | string[] | null
  extra_metadata: Record<string, unknown> | null
  view_count: number
  // YouTube-style metadata
  description: string | null
  like_count: number
  dislike_count: number
  comment_count: number
  channel_name: string | null
  channel_id: string | null
  published_at: string | null
  created_at: string
}

export interface FeedResponse {
  videos: Video[]
  algorithm: string
  page: number
  has_more: boolean
  exhausted?: boolean
}

export interface FeedParams {
  page?: number
  limit?: number
}

export interface RelatedVideosResponse {
  videos: Video[]
  algorithm: string
}

export interface VideoListResponse {
  videos: Video[]
  total: number
  has_more: boolean
}
