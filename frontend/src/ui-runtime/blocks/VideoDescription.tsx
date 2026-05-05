/**
 * VideoDescription — atom block. Shows the bound video's description with
 * optional line clamping and an expandable toggle. The expandable
 * variant matches YouTube preset's "...Show more" affordance.
 */
import { useState, type CSSProperties } from 'react'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function VideoDescriptionBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  const [expanded, setExpanded] = useState(false)
  if (!video || !video.description) return null

  const lineClamp = p<number>(node, 'lineClamp', 3)
  const expandable = p<boolean>(node, 'expandable', false)
  const fontSize = p<string>(node, 'fontSize', '14px')
  const color = p<string>(node, 'color', 'inherit')
  const background = p<string>(node, 'background', '')

  const baseStyle: CSSProperties = {
    fontSize,
    color,
    whiteSpace: 'pre-line',
    margin: 0,
  }
  const clampedStyle: CSSProperties = expanded
    ? baseStyle
    : {
        ...baseStyle,
        display: '-webkit-box',
        WebkitLineClamp: lineClamp,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }

  if (!expandable) {
    return <p style={clampedStyle}>{video.description}</p>
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full text-left p-3 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
      style={background ? { background } : undefined}
    >
      <p style={clampedStyle}>{video.description}</p>
      <span className="mt-2 inline-block text-xs font-semibold">
        {expanded ? 'Show less' : '...Show more'}
      </span>
    </button>
  )
}

export const VideoDescriptionSpec: BlockSpec = {
  type: 'VideoDescription',
  category: 'atom',
  description: 'Bound video description. Optional line clamp + expandable toggle.',
  defaultProps: { lineClamp: 3, expandable: false, fontSize: '14px', color: 'inherit', background: '' },
  propSchema: [
    { key: 'lineClamp', label: 'Line Clamp', type: 'number', min: 1, max: 20 },
    { key: 'expandable', label: 'Expandable', type: 'toggle' },
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'background', label: 'Background', type: 'color', showWhen: (props) => props.expandable === true },
  ],
  Component: VideoDescriptionBlock,
}
