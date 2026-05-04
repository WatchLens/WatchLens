export interface Comment {
  id: number
  comment_id: string
  parent_id: string | null
  author_name: string
  author_channel_id: string | null
  text: string
  like_count: number
  published_at: string | null
  reply_count: number
}

export interface CommentListResponse {
  comments: Comment[]
  total: number
  page: number
  limit: number
  has_more: boolean
}
