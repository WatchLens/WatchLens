/**
 * CommentList — wraps the bundled `<CommentSection>`. Reads the bound
 * video id from env (iter > pageVideo) and forwards default-expanded
 * preference. Uses `useComments` / `useReplies` internally; the platform
 * data hooks are the single source of truth, so this block is just a
 * presentational adapter.
 */
import CommentSection from '@/components/video/CommentSection'
import type { BlockSpec, BlockRenderProps } from './types'
import { activeVideo, p } from './types'

function CommentListBlock({ node, env }: BlockRenderProps): JSX.Element | null {
  const video = activeVideo(env)
  if (!video) return null
  const defaultExpanded = p<boolean>(node, 'defaultExpanded', false)
  return (
    <CommentSection
      videoId={video.video_id}
      commentCount={video.comment_count}
      defaultExpanded={defaultExpanded}
    />
  )
}

export const CommentListSpec: BlockSpec = {
  type: 'CommentList',
  category: 'data-bound',
  description: 'Comments thread for the bound video.',
  defaultProps: { defaultExpanded: false },
  propSchema: [{ key: 'defaultExpanded', label: 'Default Expanded', type: 'toggle' }],
  Component: CommentListBlock,
}
