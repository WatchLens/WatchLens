/**
 * Phase 4 verification demos. Encode the four built-in UIs as block
 * trees (atom-only) and render them through `BlockTreeRenderer`.
 *
 * Mount paths:
 *   /dev/blocks/feed                          YouTube longform feed (atom card)
 *   /dev/blocks/watch/:videoId                YouTube longform watch (atom card sidebar)
 *   /dev/blocks/tiktok-feed                   TikTok-style 9:16 feed (atom card)
 *   /dev/blocks/tiktok-watch/:videoId         TikTok desktop watch (Tabs + atom related)
 *
 * Known limitations of the editor track (documented for paper):
 * - meta-overlay (caption-on-thumbnail) layout requires absolute
 *   positioning. The current block library has no `Layer` block, so
 *   TikTok feed cards drop to the meta-below 9:16 layout (caption row
 *   under thumbnail, not over). The TikTok watch related panel uses
 *   meta-below 9:16 for the same reason.
 * - Shorts watch keeps the legacy `<ShortsWatch>` component (not yet
 *   re-encoded as a tree); decision documented in Phase 4 notes.
 */
import { BlockTreeRenderer } from '@/ui-runtime/blocks'
import type { BlockNode } from '@/ui-runtime/blocks'
import Header from '@/components/layout/Header'

/** A YouTube-style 16:9 card: thumbnail above, avatar + title/channel/views below. */
function youtubeCard(idPrefix: string): BlockNode {
  return {
    id: `${idPrefix}-card`,
    type: 'Stack',
    props: { gap: '8px' },
    children: [
      {
        id: `${idPrefix}-thumb`,
        type: 'Thumbnail',
        props: { aspect: '16/9', showDuration: true, borderRadius: '12px' },
      },
      {
        id: `${idPrefix}-meta-row`,
        type: 'Grid',
        props: { columnsTemplate: 'auto 1fr', gap: '8px' },
        children: [
          { id: `${idPrefix}-avatar`, type: 'ChannelAvatar', props: { size: 36 } },
          {
            id: `${idPrefix}-meta-col`,
            type: 'Stack',
            props: { gap: '2px' },
            children: [
              {
                id: `${idPrefix}-title`,
                type: 'VideoTitle',
                props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
              },
              { id: `${idPrefix}-channel`, type: 'VideoChannel', props: { fontSize: '12px', color: '#606060' } },
              { id: `${idPrefix}-views`, type: 'VideoViews', props: { fontSize: '12px', color: '#606060' } },
            ],
          },
        ],
      },
    ],
  }
}

/** Sidebar-style card: 168px thumbnail left, meta column right (Grid columnsTemplate). */
function sidebarCard(idPrefix: string): BlockNode {
  return {
    id: `${idPrefix}-card`,
    type: 'Grid',
    props: { columnsTemplate: '168px 1fr', gap: '8px' },
    children: [
      {
        id: `${idPrefix}-thumb`,
        type: 'Thumbnail',
        props: { aspect: '16/9', showDuration: true, borderRadius: '8px' },
      },
      {
        id: `${idPrefix}-meta`,
        type: 'Stack',
        props: { gap: '2px' },
        children: [
          {
            id: `${idPrefix}-title`,
            type: 'VideoTitle',
            props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
          },
          { id: `${idPrefix}-channel`, type: 'VideoChannel', props: { fontSize: '12px', color: '#606060' } },
          { id: `${idPrefix}-views`, type: 'VideoViews', props: { fontSize: '12px', color: '#606060' } },
        ],
      },
    ],
  }
}

/** TikTok-style 9:16 card: tall thumbnail + channel handle + like count below. */
function tiktokCard(idPrefix: string): BlockNode {
  return {
    id: `${idPrefix}-card`,
    type: 'Stack',
    props: { gap: '6px' },
    children: [
      {
        id: `${idPrefix}-thumb`,
        type: 'Thumbnail',
        props: { aspect: '9/16', showDuration: false, borderRadius: '8px' },
      },
      {
        id: `${idPrefix}-row`,
        type: 'Grid',
        // Handle flex left, like count tight right.
        props: { columnsTemplate: '1fr auto', gap: '4px' },
        children: [
          {
            id: `${idPrefix}-handle`,
            type: 'Grid',
            // Avatar tight, channel handle tight beside it.
            props: { columnsTemplate: 'auto auto', gap: '4px' },
            children: [
              { id: `${idPrefix}-avatar`, type: 'ChannelAvatar', props: { size: 20 } },
              {
                id: `${idPrefix}-channel`,
                type: 'VideoChannel',
                props: { fontSize: '11px', color: '#374151', prefix: '@' },
              },
            ],
          },
          { id: `${idPrefix}-likes`, type: 'VideoLikes', props: { fontSize: '11px', color: '#6b7280', showHeart: true } },
        ],
      },
    ],
  }
}

const YOUTUBE_FEED_TREE: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '24px' },
  children: [
    {
      id: 'list',
      type: 'VideoList',
      props: { layout: 'grid', columns: 4, gap: '16px' },
      slots: { item: [youtubeCard('yt-feed')] },
    },
  ],
}

const YOUTUBE_WATCH_TREE: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '24px', maxWidth: '1800px' },
  children: [
    {
      id: 'split',
      type: 'SplitColumn',
      props: { sidebarPosition: 'right', sidebarWidth: '400px', gap: '24px' },
      slots: {
        main: [
          {
            id: 'main-stack',
            type: 'Stack',
            props: { gap: '12px' },
            children: [
              { id: 'player', type: 'VideoPlayer', props: { aspect: '16/9' } },
              {
                id: 'title',
                type: 'VideoTitle',
                props: { fontSize: '20px', fontWeight: '600', lines: 2, color: '#0f0f0f' },
              },
              {
                id: 'meta-row',
                type: 'Grid',
                // Views flex left, action buttons natural-width right.
                props: { columnsTemplate: '1fr auto', gap: '16px' },
                children: [
                  { id: 'views', type: 'VideoViews', props: { fontSize: '14px', color: '#606060' } },
                  { id: 'actions', type: 'VideoActions', props: { showLike: true, showDislike: true } },
                ],
              },
              {
                id: 'channel-row',
                type: 'Grid',
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  { id: 'channel-avatar', type: 'ChannelAvatar', props: { size: 32, shape: 'circle' } },
                  {
                    id: 'channel-name',
                    type: 'VideoChannel',
                    props: { fontSize: '14px', color: '#0f0f0f' },
                  },
                ],
              },
              {
                id: 'desc',
                type: 'VideoDescription',
                props: { lineClamp: 3, expandable: true, fontSize: '14px' },
              },
              { id: 'tags', type: 'VideoTags', props: {} },
              { id: 'comments', type: 'CommentList', props: { defaultExpanded: true } },
            ],
          },
        ],
        sidebar: [
          {
            id: 'related-list',
            type: 'VideoList',
            props: { layout: 'list', gap: '12px' },
            slots: { item: [sidebarCard('yt-side')] },
          },
        ],
      },
    },
  ],
}

const TIKTOK_FEED_TREE: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '24px' },
  children: [
    {
      id: 'list',
      type: 'VideoList',
      props: { layout: 'grid', columns: 4, gap: '12px' },
      slots: { item: [tiktokCard('tt-feed')] },
    },
  ],
}

const TIKTOK_WATCH_TREE: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#000000', padding: '0' },
  children: [
    {
      id: 'split',
      type: 'SplitColumn',
      props: { sidebarPosition: 'right', sidebarWidth: '40%', gap: '0' },
      slots: {
        main: [
          {
            id: 'main-center',
            type: 'Stack',
            props: { gap: '0', align: 'center', justify: 'center' },
            children: [{ id: 'player', type: 'VideoPlayer', props: { aspect: '9/16' } }],
          },
        ],
        sidebar: [
          {
            id: 'sidebar-stack',
            type: 'Stack',
            props: { gap: '0' },
            children: [
              {
                id: 'sidebar-meta',
                type: 'Stack',
                props: { gap: '12px' },
                children: [
                  {
                    id: 'channel-row',
                    type: 'Grid',
                    props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                    children: [
                      { id: 'channel-avatar', type: 'ChannelAvatar', props: { size: 32, shape: 'circle' } },
                      {
                        id: 'channel-name',
                        type: 'VideoChannel',
                        props: { fontSize: '14px', color: '#ffffff' },
                      },
                    ],
                  },
                  {
                    id: 'caption',
                    type: 'VideoTitle',
                    props: { fontSize: '14px', fontWeight: '500', lines: 4, color: '#e5e7eb' },
                  },
                  { id: 'tags', type: 'VideoTags', props: { fontSize: '14px' } },
                  {
                    id: 'actions',
                    type: 'VideoActions',
                    props: { showLike: true, showDislike: false },
                  },
                ],
              },
              {
                id: 'tabs',
                type: 'Tabs',
                props: {
                  tabs: [
                    { id: 'comments', label: 'Comments' },
                    { id: 'related', label: 'Related' },
                  ],
                  initialTab: 'comments',
                },
                slots: {
                  comments: [{ id: 'comment-list', type: 'CommentList', props: { defaultExpanded: true } }],
                  related: [
                    {
                      id: 'related-list',
                      type: 'VideoList',
                      props: { layout: 'grid', columns: 2, gap: '8px' },
                      slots: { item: [tiktokCard('tt-related')] },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    },
  ],
}

export function BlockDemoFeed(): JSX.Element {
  return (
    <>
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="feed" tree={YOUTUBE_FEED_TREE} />
      </main>
    </>
  )
}

export function BlockDemoWatch(): JSX.Element {
  return (
    <>
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="watch" tree={YOUTUBE_WATCH_TREE} />
      </main>
    </>
  )
}

export function BlockDemoTiktokFeed(): JSX.Element {
  return (
    <>
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="feed" tree={TIKTOK_FEED_TREE} />
      </main>
    </>
  )
}

export function BlockDemoTiktokWatch(): JSX.Element {
  return (
    <>
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="watch" tree={TIKTOK_WATCH_TREE} />
      </main>
    </>
  )
}
