import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getVideoComments, getCommentReplies } from '@/api/videos'
import type { Comment, CommentListResponse } from '@/types'

// --- Helpers ---

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}hr ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${Math.floor(diffMonth / 12)}yr ago`
}

function formatLikes(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return `${count}`
}

// --- Reply component ---

interface ReplyListProps {
  videoId: string
  commentId: string
  replyCount: number
}

function ReplyList({ videoId, commentId, replyCount }: ReplyListProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<CommentListResponse>({
    queryKey: ['replies', videoId, commentId],
    queryFn: ({ pageParam }) =>
      getCommentReplies(videoId, commentId, pageParam as number, 10),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: expanded,
  })

  const allReplies = data?.pages.flatMap((p) => p.comments) || []

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 text-blue-600 text-xs font-medium mt-1 hover:bg-blue-50 px-2 py-1 rounded-full"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {replyCount} replies
      </button>
    )
  }

  return (
    <div className="mt-2 ml-2 space-y-3">
      {allReplies.map((reply) => (
        <CommentItem key={reply.id} comment={reply} videoId={videoId} isReply />
      ))}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="text-blue-600 text-xs font-medium hover:bg-blue-50 px-2 py-1 rounded-full"
        >
          {isFetchingNextPage ? 'Loading...' : 'Show more replies'}
        </button>
      )}
      <button
        onClick={() => setExpanded(false)}
        className="flex items-center gap-1 text-blue-600 text-xs font-medium hover:bg-blue-50 px-2 py-1 rounded-full"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        Hide replies
      </button>
    </div>
  )
}

// --- Single comment item ---

interface CommentItemProps {
  comment: Comment
  videoId: string
  isReply?: boolean
}

function CommentItem({ comment, videoId, isReply = false }: CommentItemProps): JSX.Element {
  return (
    <div className={`flex gap-3 ${isReply ? '' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 ${isReply ? 'w-6 h-6' : 'w-10 h-10'} rounded-full bg-gray-300 flex items-center justify-center`}>
        <span className={`${isReply ? 'text-[10px]' : 'text-sm'} font-medium text-gray-600`}>
          {(comment.author_name || '?')[0].toUpperCase()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium text-gray-900 ${isReply ? 'text-xs' : 'text-[13px]'}`}>
            {comment.author_name}
          </span>
          <span className="text-xs text-gray-500">
            {timeAgo(comment.published_at)}
          </span>
        </div>

        <p className={`text-gray-800 mt-0.5 whitespace-pre-line ${isReply ? 'text-xs' : 'text-sm'}`}>
          {comment.text}
        </p>

        {/* Like count */}
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1 text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
              />
            </svg>
            {comment.like_count > 0 && (
              <span className="text-xs">{formatLikes(comment.like_count)}</span>
            )}
          </div>
        </div>

        {/* Replies */}
        {!isReply && comment.reply_count > 0 && (
          <ReplyList videoId={videoId} commentId={comment.comment_id} replyCount={comment.reply_count} />
        )}
      </div>
    </div>
  )
}

// --- Main CommentSection ---

interface CommentSectionProps {
  videoId: string
  commentCount?: number
  /**
   * Render expanded by default. YouTube-style watch pages show comments
   * inline; TikTok shows comments collapsed behind a button until tapped.
   * Default false to keep historical behavior.
   */
  defaultExpanded?: boolean
}

export default function CommentSection({
  videoId,
  commentCount,
  defaultExpanded = false,
}: CommentSectionProps): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<CommentListResponse>({
    queryKey: ['comments', videoId],
    queryFn: ({ pageParam }) => getVideoComments(videoId, pageParam as number, 20),
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: expanded,
  })

  const allComments = data?.pages.flatMap((p) => p.comments) || []
  const total = data?.pages[0]?.total ?? commentCount ?? 0

  // Collapsed header
  if (!expanded) {
    return (
      <div className="mt-6">
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-left p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-gray-900 text-sm">
              Comments {total > 0 && <span className="text-gray-500 font-normal">{total.toLocaleString()}</span>}
            </span>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6">
      {/* Header — clickable as a whole, mirroring the collapsed state so
          the same target opens AND closes the section. */}
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="w-full flex items-center justify-between mb-4 text-left hover:bg-gray-100 rounded-md px-2 -mx-2 py-1 transition-colors"
      >
        <h3 className="font-medium text-gray-900 text-sm">
          Comments <span className="text-gray-500 font-normal">{total.toLocaleString()}</span>
        </h3>
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Comment list */}
      {isLoading && (
        <div className="text-gray-500 text-sm py-4">Loading comments...</div>
      )}

      <div className="space-y-4">
        {allComments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} videoId={videoId} />
        ))}
      </div>

      {/* Load more */}
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full py-2 text-center text-blue-600 text-sm font-medium hover:bg-blue-50 rounded-lg transition-colors"
        >
          {isFetchingNextPage ? 'Loading...' : 'Show more comments'}
        </button>
      )}

      {!isLoading && allComments.length === 0 && (
        <div className="text-gray-500 text-sm py-4">No comments yet</div>
      )}
    </div>
  )
}
