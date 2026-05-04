/**
 * VideoLikes — atom block for the bound video's like count. Optionally
 * renders a heart icon prefix (TikTok feed style). Read-only: no
 * onClick, no LIKE event emit. For the interactive button see
 * `VideoActions`.
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function formatCount(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function VideoLikesBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const fontSize = p<string>(node, 'fontSize', '12px')
  const color = p<string>(node, 'color', 'inherit')
  const showHeart = p<boolean>(node, 'showHeart', true)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize, color }}>
      {showHeart && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      )}
      {formatCount(video.like_count)}
    </span>
  )
}

export const VideoLikesSpec: BlockSpec = {
  type: 'VideoLikes',
  category: 'atom',
  description: 'Bound like count (read-only). For interactive Like button see VideoActions.',
  defaultProps: { fontSize: '12px', color: 'inherit', showHeart: true },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'showHeart', label: 'Heart icon', type: 'toggle' },
  ],
  Component: VideoLikesBlock,
}
