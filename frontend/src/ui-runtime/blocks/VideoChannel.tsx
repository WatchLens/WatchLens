/**
 * VideoChannel — atom block for the bound video's channel name.
 *
 * The optional `prefix` prop (default '') is prepended to the channel
 * name — TikTok-style handles use `'@'` so `Test` displays as `@test`.
 *
 * For card layouts that include an avatar, compose a separate
 * `ChannelAvatar` atom alongside this one (via Grid columns).
 */
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function applyPrefix(prefix: string, channel: string): string {
  if (!prefix) return channel
  if (prefix === '@') return `@${channel.toLowerCase().replace(/\s+/g, '_')}`
  return `${prefix}${channel}`
}

function VideoChannelBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const fontSize = p<string>(node, 'fontSize', '12px')
  const color = p<string>(node, 'color', 'inherit')
  const prefix = p<string>(node, 'prefix', '')
  const raw = video.channel_name || video.category || 'Channel'
  const display = applyPrefix(prefix, raw)
  return <span style={{ fontSize, color }}>{display}</span>
}

export const VideoChannelSpec: BlockSpec = {
  type: 'VideoChannel',
  category: 'atom',
  description: 'Bound channel name. Optional prefix (e.g. `@` for handle style).',
  defaultProps: { fontSize: '12px', color: 'inherit', prefix: '' },
  propSchema: [
    { key: 'fontSize', label: 'Font Size', type: 'size', unit: 'px' },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'prefix', label: 'Prefix', type: 'text' },
  ],
  Component: VideoChannelBlock,
}
