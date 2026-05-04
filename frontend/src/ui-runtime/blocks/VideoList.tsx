/**
 * VideoList — iterates the page's videos. The data source is automatic:
 * - Feed page → uses `env.feedVideos` (the platform's feed recommendation)
 * - Watch page → uses `env.relatedVideos` (related to current video)
 *
 * The `layout` prop picks the visual arrangement of the iteration:
 * - `grid`: N-column CSS grid.
 * - `list`: single-column stack of horizontal cards.
 *
 * The slot template is the single source of truth for the per-card
 * design in BOTH layouts. The editor's BlockTreeNodeEditor swaps the
 * slot template to a layout-appropriate default (`gridCardTemplate()` /
 * `listCardTemplate()`) when the admin toggles `layout` — see
 * `cardTemplates.ts`. Researchers can edit the template afterwards.
 *
 * Per-card events (IMPRESSION, FEED_CLICK / VIDEO_CLICK,
 * THUMBNAIL_HOVER) come from the surrounding `<VideoSurface>`. Iteration
 * also pushes `env.iter` so descendant atoms read the current iteration.
 */
import type { CSSProperties } from 'react'
import { VideoSurface } from '@/ui-runtime/surfaces'
import type { BlockSpec, BlockRenderProps, RenderEnv } from './types'
import { p } from './types'

function VideoListBlock({ node, env, renderSlot }: BlockRenderProps): JSX.Element {
  const layout = p<'grid' | 'list'>(node, 'layout', 'grid')
  const columns = p<number>(node, 'columns', 4)
  const gap = p<string>(node, 'gap', '16px')
  const maxItems = p<number | null>(node, 'maxItems', null)

  // Source is implicit — use feed videos on the feed page, related on
  // the watch page. Researchers compose UI; the platform decides what
  // to recommend in each context.
  const source: 'feed' | 'related' = env.page === 'feed' ? 'feed' : 'related'
  const all = source === 'feed' ? env.feedVideos ?? [] : env.relatedVideos ?? []
  const videos = maxItems != null && maxItems > 0 ? all.slice(0, maxItems) : all

  const containerStyle: CSSProperties =
    layout === 'list'
      ? { display: 'flex', flexDirection: 'column', gap }
      : { display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }

  return (
    <div style={containerStyle}>
      {videos.map((video, i) => {
        const iter: RenderEnv['iter'] = { source, video, position: i }
        return (
          <VideoSurface
            key={video.id}
            video={video}
            position={i}
            context={source === 'feed' ? 'feed' : 'related'}
            onClick={() => env.navigateToVideo(video.video_id)}
          >
            <div>{renderSlot('item', { iter })}</div>
          </VideoSurface>
        )
      })}
    </div>
  )
}

export const VideoListSpec: BlockSpec = {
  type: 'VideoList',
  category: 'data-bound',
  slots: ['item'],
  slotLabels: { item: 'Each card' },
  description:
    'Repeats a card per video. "Grid" = N-column grid; "List" = single-column horizontal cards. Data source is automatic: feed page uses recommendations, watch page uses related-to-current. Switching layout swaps the card template to a sensible default — edit it afterwards.',
  defaultProps: {
    layout: 'grid',
    columns: 4,
    gap: '16px',
    maxItems: null,
  },
  propSchema: [
    { key: 'layout', label: 'Layout', type: 'layout' },
    {
      key: 'columns',
      label: 'Columns',
      type: 'number',
      min: 1,
      max: 12,
      showWhen: (props) => (props.layout ?? 'grid') !== 'list',
    },
    { key: 'gap', label: 'Gap', type: 'size', unit: 'px' },
    { key: 'maxItems', label: 'Max Items', type: 'number', min: 0, max: 100 },
  ],
  Component: VideoListBlock,
}
