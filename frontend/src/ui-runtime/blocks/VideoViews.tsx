/**
 * VideoViews — atom block. Shows the bound video's view count, formatted
 * (1.2K / 3.4M / etc.).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function formatViewCount(n: number | null | undefined): string {
  const v = n ?? 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M views`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K views`
  return `${v} views`
}

function VideoViewsBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const fontSize = p<string>(node, 'fontSize', '14px')
  const color = p<string>(node, 'color', 'inherit')
  return <span style={{ fontSize, color }}>{formatViewCount(video.view_count)}</span>
}

export const VideoViewsSpec: BlockSpec = {
  type: 'VideoViews',
  category: 'atom',
  description: 'Bound view count, formatted (1.2K, 3.4M, …).',
  defaultProps: { fontSize: '14px', color: 'inherit' },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
  ],
  Component: VideoViewsBlock,
}
