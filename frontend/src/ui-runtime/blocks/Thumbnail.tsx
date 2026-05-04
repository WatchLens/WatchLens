/**
 * Thumbnail — atom block for the bound video's thumbnail image. Reads
 * `resolved_url.thumbnail_url` (or falls back to `video.thumbnail_url`),
 * tries jpg/png/webp extensions in turn if the path is extension-less,
 * and falls back to a placeholder icon if all fail.
 *
 * Composes with Stack/Grid containers + other atoms to build cards.
 */
import { useState } from 'react'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

const THUMBNAIL_EXTENSIONS = ['jpg', 'png', 'webp'] as const

const POS_STYLE: Record<string, React.CSSProperties> = {
  'bottom-right': { bottom: 4, right: 4 },
  'bottom-left': { bottom: 4, left: 4 },
  'top-right': { top: 4, right: 4 },
  'top-left': { top: 4, left: 4 },
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return hrs > 0
    ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins}:${secs.toString().padStart(2, '0')}`
}

function ThumbnailBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const [extIndex, setExtIndex] = useState(0)
  const [error, setError] = useState(false)
  const video = activeVideo(env)
  if (!video) return null

  const aspect = p<string>(node, 'aspect', '16/9')
  const borderRadius = p<string>(node, 'borderRadius', '12px')
  const showDuration = p<boolean>(node, 'showDuration', true)
  const durationPosition = p<string>(node, 'durationPosition', 'bottom-right')

  const base = video.resolved_url?.thumbnail_url || video.thumbnail_url
  const src: string | null = error
    ? null
    : base
    ? base.includes('.')
      ? base
      : `${base}.${THUMBNAIL_EXTENSIONS[extIndex]}`
    : null

  const handleError = (): void => {
    if (base && !base.includes('.')) {
      if (extIndex < THUMBNAIL_EXTENSIONS.length - 1) setExtIndex((i) => i + 1)
      else setError(true)
    } else {
      setError(true)
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: aspect,
        background: '#e5e7eb',
        borderRadius,
        overflow: 'hidden',
      }}
    >
      {src ? (
        <img
          src={src}
          alt={video.title || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={handleError}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      )}
      {showDuration && video.duration != null && video.duration > 0 && (
        <span
          style={{
            position: 'absolute',
            ...POS_STYLE[durationPosition],
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 10,
            fontFamily: 'monospace',
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {formatDuration(video.duration)}
        </span>
      )}
    </div>
  )
}

export const ThumbnailSpec: BlockSpec = {
  type: 'Thumbnail',
  category: 'data-bound',
  description: 'Bound video thumbnail image with optional duration badge overlay.',
  defaultProps: {
    aspect: '16/9',
    borderRadius: '12px',
    showDuration: true,
    durationPosition: 'bottom-right',
  },
  propSchema: [
    { key: 'aspect', label: 'Aspect', type: 'aspect' },
    { key: 'borderRadius', label: 'Radius', type: 'size', unit: 'px' },
    { key: 'showDuration', label: 'Duration', type: 'toggle' },
    {
      key: 'durationPosition',
      label: 'Duration pos',
      type: 'select',
      options: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    },
  ],
  Component: ThumbnailBlock,
}
