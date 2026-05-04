/**
 * Default block trees for fresh templates. New tree-mode templates open
 * with these so the editor isn't a blank canvas; admins can edit them
 * down or extend.
 *
 * Both trees compose cards purely from atom blocks (Thumbnail,
 * ChannelAvatar, VideoTitle, VideoChannel, VideoViews, …). Each atom's
 * position / size / color is editable; there is no black-box composite.
 */
import type { BlockNode } from './types'

/** YouTube-classic feed: 4-column grid; cards with thumbnail above + meta row below. */
export const DEFAULT_FEED_TREE: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '24px' },
  children: [
    {
      id: 'list',
      type: 'VideoList',
      props: { layout: 'grid', columns: 4, gap: '16px' },
      slots: {
        item: [
          {
            id: 'card',
            type: 'Stack',
            props: { gap: '8px' },
            children: [
              {
                id: 'card-thumb',
                type: 'Thumbnail',
                props: { aspect: '16/9', showDuration: true, borderRadius: '12px' },
              },
              {
                id: 'card-meta',
                type: 'Grid',
                // Avatar tight on the left, meta text column flex on the right.
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  {
                    id: 'card-avatar',
                    type: 'ChannelAvatar',
                    props: { size: 36, shape: 'circle' },
                  },
                  {
                    id: 'card-text',
                    type: 'Stack',
                    props: { gap: '2px' },
                    children: [
                      {
                        id: 'card-title',
                        type: 'VideoTitle',
                        props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
                      },
                      {
                        id: 'card-channel',
                        type: 'VideoChannel',
                        props: { fontSize: '12px', color: '#606060' },
                      },
                      {
                        id: 'card-views',
                        type: 'VideoViews',
                        props: { fontSize: '12px', color: '#606060' },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
}

/**
 * YouTube-classic watch: aspect-video player + sidebar of related cards.
 * Sidebar VideoList is in list layout — each related card is a
 * 168px thumbnail + meta-right Grid (matches `listCardTemplate()`).
 */
export const DEFAULT_WATCH_TREE: BlockNode = {
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
                // Views flex on the left, action buttons natural-width on the right.
                props: { columnsTemplate: '1fr auto', gap: '16px' },
                children: [
                  { id: 'views', type: 'VideoViews', props: { fontSize: '14px', color: '#606060' } },
                  { id: 'actions', type: 'VideoActions', props: { showLike: true, showDislike: true } },
                ],
              },
              {
                id: 'channel-row',
                type: 'Grid',
                // Avatar tight on the left, channel name flex on the right.
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  {
                    id: 'channel-avatar',
                    type: 'ChannelAvatar',
                    props: { size: 32, shape: 'circle' },
                  },
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
              { id: 'comments', type: 'CommentList', props: { defaultExpanded: true } },
            ],
          },
        ],
        sidebar: [
          {
            id: 'related-list',
            type: 'VideoList',
            props: { layout: 'list', gap: '12px' },
            slots: {
              item: [
                {
                  id: 'related-card',
                  type: 'Grid',
                  // 168px thumbnail + flex meta = YouTube-style sidebar card.
                  props: { columnsTemplate: '168px 1fr', gap: '8px' },
                  children: [
                    {
                      id: 'related-thumb',
                      type: 'Thumbnail',
                      props: { aspect: '16/9', showDuration: true, borderRadius: '8px' },
                    },
                    {
                      id: 'related-meta',
                      type: 'Stack',
                      props: { gap: '2px' },
                      children: [
                        {
                          id: 'related-title',
                          type: 'VideoTitle',
                          props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
                        },
                        {
                          id: 'related-channel',
                          type: 'VideoChannel',
                          props: { fontSize: '12px', color: '#606060' },
                        },
                        {
                          id: 'related-views',
                          type: 'VideoViews',
                          props: { fontSize: '12px', color: '#606060' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  ],
}
