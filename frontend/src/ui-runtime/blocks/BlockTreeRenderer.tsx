/**
 * Recursive renderer for block trees authored in the editor.
 *
 * Entry point: `<BlockTreeRenderer page="feed" tree={...} />`. The
 * renderer mounts the appropriate page-level surface (FeedSurface or
 * WatchSurface), pre-fetches feed/related data once, and walks the tree
 * dispatching to each block's spec via the registry.
 *
 * Per-iteration overrides (VideoList) are threaded by passing
 * `Partial<RenderEnv>` to `renderSlot('item', { iter })`.
 *
 * Editor mode: pass `mock` to skip the data hooks and render against
 * the bundled mock dataset. Surfaces still mount so the visual output
 * matches production; events fire into whatever EventProvider is in
 * scope (the admin's session in editor preview).
 */
import { useCallback, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFeed, useVideo, useRelated } from '@/ui-runtime/data'
import { FeedSurface, WatchSurface } from '@/ui-runtime/surfaces'
import type { Video } from '@/types'
import type { BlockNode, RenderEnv } from './types'
import { lookupBlock } from './registry'
import { MOCK_FEED_VIDEOS, MOCK_RELATED_VIDEOS, MOCK_PAGE_VIDEO } from './mocks'

export interface BlockTreeRendererProps {
  page: 'feed' | 'watch'
  tree: BlockNode
  /**
   * Editor preview mode. When set, the renderer skips data hooks and
   * uses bundled mock videos so the tree previews without requiring a
   * user_group_id or a real videoId in the URL.
   */
  mock?: boolean | {
    feed?: Video[]
    related?: Video[]
    pageVideo?: Video
  }
  /**
   * Editor-preview only. Outline the rendered output of the node with
   * this id (and any iterated copy of it inside a VideoList) so the
   * admin can see where in the page their selected tree row lives.
   */
  highlightId?: string | null
  /**
   * Editor-preview only. When set, clicking any block in the preview
   * walks up the DOM to find the nearest `data-block-id` and calls
   * this with that id — letting admins click the rendered output to
   * select the corresponding row in the tree.
   */
  onSelectFromPreview?: (id: string) => void
}

export function BlockTreeRenderer({
  page,
  tree,
  mock,
  highlightId,
  onSelectFromPreview,
}: BlockTreeRendererProps): JSX.Element {
  const navigate = useNavigate()
  const navigateToVideo = useCallback(
    (videoId: string) => navigate(`/watch/${videoId}`),
    [navigate],
  )
  if (mock) {
    return (
      <MockTreeRoot
        page={page}
        tree={tree}
        mock={mock}
        navigateToVideo={navigateToVideo}
        highlightId={highlightId ?? null}
        onSelectFromPreview={onSelectFromPreview}
      />
    )
  }
  return page === 'feed' ? (
    <FeedTreeRoot tree={tree} navigateToVideo={navigateToVideo} />
  ) : (
    <WatchTreeRoot tree={tree} navigateToVideo={navigateToVideo} />
  )
}

interface RootProps {
  tree: BlockNode
  navigateToVideo: (videoId: string) => void
}

function FeedTreeRoot({ tree, navigateToVideo }: RootProps): JSX.Element {
  const { videos } = useFeed({ limit: 40 })
  const env: RenderEnv = {
    page: 'feed',
    feedVideos: videos,
    navigateToVideo,
  }
  return (
    <FeedSurface videos={videos}>
      <RenderNode node={tree} env={env} />
    </FeedSurface>
  )
}

function WatchTreeRoot({ tree, navigateToVideo }: RootProps): JSX.Element {
  const { videoId } = useParams<{ videoId: string }>()
  const { video } = useVideo(videoId)
  const { videos: related } = useRelated(videoId, { limit: 12 })
  const env: RenderEnv = {
    page: 'watch',
    pageVideo: video,
    relatedVideos: related,
    navigateToVideo,
  }
  return (
    <WatchSurface video={video} relatedVideos={related}>
      <RenderNode node={tree} env={env} />
    </WatchSurface>
  )
}

interface MockRootProps extends RootProps {
  page: 'feed' | 'watch'
  mock: NonNullable<BlockTreeRendererProps['mock']>
  highlightId: string | null
  onSelectFromPreview?: (id: string) => void
}

function MockTreeRoot({
  page,
  tree,
  mock,
  highlightId,
  onSelectFromPreview,
}: MockRootProps): JSX.Element {
  const mockOverrides = typeof mock === 'object' ? mock : {}
  const feed = mockOverrides.feed ?? MOCK_FEED_VIDEOS
  const related = mockOverrides.related ?? MOCK_RELATED_VIDEOS
  const pageVideo = mockOverrides.pageVideo ?? MOCK_PAGE_VIDEO
  // In editor preview, clicks must not navigate: mock video ids are not
  // in the DB, and an admin clicking a feed card would be bounced to
  // /admin by ProtectedRoute anyway. Surface events still fire because
  // VideoSurface emits before invoking the (no-op) navigation callback.
  const env: RenderEnv = {
    page,
    feedVideos: feed,
    relatedVideos: related,
    pageVideo: page === 'watch' ? pageVideo : undefined,
    navigateToVideo: () => {
      /* no-op in editor preview */
    },
    highlightId,
  }

  // Click capture for "click rendered preview → select tree row".
  // Walks up the event target to find the nearest `data-block-id`
  // attribute (set by RenderNode below). Stops on the deepest match,
  // so clicking an inner atom selects the atom, not its container.
  const handleClick = (e: React.MouseEvent): void => {
    if (!onSelectFromPreview) return
    let el: HTMLElement | null = e.target as HTMLElement
    while (el) {
      const id = el.getAttribute?.('data-block-id')
      if (id) {
        e.stopPropagation()
        onSelectFromPreview(id)
        return
      }
      el = el.parentElement
    }
  }

  const inner =
    page === 'feed' ? (
      <FeedSurface videos={feed}>
        <RenderNode node={tree} env={env} />
      </FeedSurface>
    ) : (
      <WatchSurface video={pageVideo} relatedVideos={related}>
        <RenderNode node={tree} env={env} />
      </WatchSurface>
    )

  return onSelectFromPreview ? <div onClickCapture={handleClick}>{inner}</div> : inner
}

interface RenderNodeProps {
  node: BlockNode
  env: RenderEnv
}

export function RenderNode({ node, env }: RenderNodeProps): JSX.Element {
  const spec = lookupBlock(node.type)
  if (!spec) {
    return (
      <div
        style={{
          padding: 12,
          background: '#fee',
          color: '#900',
          borderRadius: 4,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        Unknown block: {node.type}
      </div>
    )
  }
  const renderChildren = (overrides?: Partial<RenderEnv>): ReactNode => {
    const list = node.children ?? []
    const newEnv = overrides ? { ...env, ...overrides } : env
    return list.map((c) => <RenderNode key={c.id} node={c} env={newEnv} />)
  }
  const renderSlot = (name: string, overrides?: Partial<RenderEnv>): ReactNode => {
    const list = node.slots?.[name] ?? []
    const newEnv = overrides ? { ...env, ...overrides } : env
    return list.map((c) => <RenderNode key={c.id} node={c} env={newEnv} />)
  }
  const Cmp = spec.Component
  const rendered = (
    <Cmp node={node} env={env} renderChildren={renderChildren} renderSlot={renderSlot} />
  )
  if (env.highlightId && env.highlightId === node.id) {
    // Highlight selected node so admin can see what region of the
    // preview corresponds to the tree row. Drawn with an inset outline
    // so the preview pane's `overflow-hidden` doesn't clip it. The
    // wrapper has a small uniform padding so the outline has breathing
    // room around whatever it wraps.
    return (
      <div
        data-block-id={node.id}
        style={{
          outline: '3px solid #2563eb',
          outlineOffset: -3,
          borderRadius: 6,
          position: 'relative',
          padding: 6,
        }}
      >
        {rendered}
      </div>
    )
  }
  // Non-highlighted nodes still need a click-target with `data-block-id`
  // so the preview's event-delegation can resolve clicks back to the
  // tree row. `display: contents` makes the wrapper invisible to
  // layout — the rendered output still flexes/grids inside its parent
  // exactly as if RenderNode hadn't wrapped it.
  return (
    <div data-block-id={node.id} style={{ display: 'contents' }}>
      {rendered}
    </div>
  )
}
