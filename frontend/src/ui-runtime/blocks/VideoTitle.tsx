/**
 * VideoTitle — atom block. Renders the bound video's title. Reads
 * `env.iter.video` (inside a VideoList) or falls back to `env.pageVideo`
 * (on a watch page).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function VideoTitleBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const fontSize = p<string>(node, 'fontSize', '16px')
  const fontWeight = p<string>(node, 'fontWeight', '500')
  const color = p<string>(node, 'color', 'inherit')
  const lines = p<number>(node, 'lines', 2)
  return (
    <h3
      style={{
        fontSize,
        fontWeight,
        color,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}
    >
      {video.title || 'Untitled'}
    </h3>
  )
}

export const VideoTitleSpec: BlockSpec = {
  type: 'VideoTitle',
  category: 'atom',
  description: 'Bound video title text with optional line clamp.',
  defaultProps: { fontSize: '16px', fontWeight: '500', color: 'inherit', lines: 2 },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'fontWeight', label: 'Weight', type: 'select', options: ['400', '500', '600', '700'] },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'lines', label: 'Lines', type: 'number', min: 1, max: 5 },
  ],
  Component: VideoTitleBlock,
}
