/**
 * VideoDuration — atom block. Shows the bound video's duration in mm:ss
 * (or hh:mm:ss for >1h). Returns null if the video has no duration.
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return hrs > 0
    ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins}:${secs.toString().padStart(2, '0')}`
}

function VideoDurationBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video || !video.duration) return null
  const fontSize = p<string>(node, 'fontSize', '12px')
  const color = p<string>(node, 'color', 'inherit')
  return <span style={{ fontSize, color }}>{formatDuration(video.duration)}</span>
}

export const VideoDurationSpec: BlockSpec = {
  type: 'VideoDuration',
  category: 'atom',
  description: 'Bound video duration as mm:ss (or hh:mm:ss for >1h).',
  defaultProps: { fontSize: '12px', color: 'inherit' },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
  ],
  Component: VideoDurationBlock,
}
