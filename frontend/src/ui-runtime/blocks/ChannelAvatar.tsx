/**
 * ChannelAvatar — atom block for the bound video's channel avatar. The
 * platform doesn't ship per-channel images so the avatar is rendered as
 * a colored letter circle (color hashed from channel name).
 *
 * Compose alongside `VideoChannel` (via a Grid with `columnsTemplate`)
 * when a card needs both avatar and channel name side by side.
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

const AVATAR_COLORS = [
  '#ff4d4f', '#ff7a45', '#ffa940', '#bae637',
  '#36cfc9', '#40a9ff', '#9254de', '#f759ab',
]

function pickAvatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function ChannelAvatarBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const size = p<number>(node, 'size', 36)
  const shape = p<'circle' | 'square'>(node, 'shape', 'circle')
  const fontSize = p<string>(node, 'fontSize', `${Math.round(size * 0.4)}px`)

  const channel = video.channel_name || video.category || 'V'
  const bg = pickAvatarColor(channel)
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: shape === 'circle' ? '50%' : '6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize,
        flexShrink: 0,
      }}
    >
      {channel[0]?.toUpperCase()}
    </div>
  )
}

export const ChannelAvatarSpec: BlockSpec = {
  type: 'ChannelAvatar',
  category: 'data-bound',
  description: 'Bound channel\'s letter avatar (color hashed from channel name).',
  defaultProps: { size: 36, shape: 'circle' },
  propSchema: [
    { key: 'size', label: 'Size', type: 'number', min: 16, max: 96 },
    { key: 'shape', label: 'Shape', type: 'select', options: ['circle', 'square'] },
    { key: 'fontSize', label: 'Letter size', type: 'size', unit: 'px' },
  ],
  Component: ChannelAvatarBlock,
}
