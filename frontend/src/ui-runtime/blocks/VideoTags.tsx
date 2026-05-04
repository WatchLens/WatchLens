/**
 * VideoTags — atom block. Renders the bound video's tags as a wrap-flow
 * of `#tag` spans. Accepts both array tags and comma-joined string form
 * (older video records may store either).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function VideoTagsBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video || !video.tags) return null
  const fontSize = p<string>(node, 'fontSize', '14px')
  const color = p<string>(node, 'color', '#2563eb')
  const tags = Array.isArray(video.tags) ? video.tags : String(video.tags).split(',')
  return (
    <div className="flex flex-wrap gap-x-2">
      {tags.map((t, i) => (
        <span key={i} style={{ fontSize, color }}>
          #{String(t).trim()}
        </span>
      ))}
    </div>
  )
}

export const VideoTagsSpec: BlockSpec = {
  type: 'VideoTags',
  category: 'atom',
  description: 'Bound video tags row, rendered as `#hashtag` spans.',
  defaultProps: { fontSize: '14px', color: '#2563eb' },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
  ],
  Component: VideoTagsBlock,
}
