/**
 * VideoActions — like / dislike buttons. Uses `useLikes(videoId)` so the
 * LIKE / DISLIKE events are emitted automatically on toggle. Intentionally
 * scoped to the bound video, so dropping this inside a feed `VideoList`
 * iteration would let researchers add per-card likes (though the feed
 * presets don't currently do that).
 */
import { useLikes } from '@/ui-runtime/data'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function HeartIcon({ filled, rotated }: { filled: boolean; rotated?: boolean }): JSX.Element {
  return (
    <svg
      className={`w-5 h-5${rotated ? ' rotate-180' : ''}`}
      fill={filled ? 'currentColor' : 'none'}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
      />
    </svg>
  )
}

function VideoActionsBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  // Hook order: useLikes must run unconditionally; pass undefined if no video.
  const likes = useLikes(video?.video_id, { initialCount: video?.like_count })
  if (!video) return null

  const showLike = p<boolean>(node, 'showLike', true)
  const showDislike = p<boolean>(node, 'showDislike', true)

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-full">
      {showLike && (
        <button
          onClick={likes.like}
          className={`flex items-center gap-2 px-4 py-2 rounded-l-full transition-colors ${
            likes.isLiked
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <HeartIcon filled={likes.isLiked} />
          <span className="text-sm font-medium">{likes.count}</span>
        </button>
      )}
      {showLike && showDislike && <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />}
      {showDislike && (
        <button
          onClick={likes.dislike}
          className={`flex items-center gap-2 px-4 py-2 rounded-r-full transition-colors ${
            likes.isDisliked
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <HeartIcon filled={likes.isDisliked} rotated />
        </button>
      )}
    </div>
  )
}

export const VideoActionsSpec: BlockSpec = {
  type: 'VideoActions',
  category: 'data-bound',
  description: 'Interactive Like / Dislike buttons. Emits LIKE / DISLIKE events.',
  defaultProps: { showLike: true, showDislike: true },
  propSchema: [
    { key: 'showLike', label: 'Like', type: 'toggle' },
    { key: 'showDislike', label: 'Dislike', type: 'toggle' },
  ],
  Component: VideoActionsBlock,
}
