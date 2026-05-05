/**
 * Default block trees for fresh templates, per device.
 *
 * The editor's hydration / device-change handler picks the matching
 * tree based on `template.device`. Each device's default reflects the
 * topology that real-world platforms use at that viewport size:
 *
 *   - **desktop** — multi-column (4) feed grid, 16:9 player + sidebar
 *     of related cards on watch.
 *   - **tablet**  — 2-column feed grid (per the YouTube iPad layout),
 *     narrower related sidebar on watch.
 *   - **mobile**  — single-column feed list (full-width cards), no
 *     sidebar on watch — related list stacks under the player.
 *
 * `DEFAULT_FEED_TREE` / `DEFAULT_WATCH_TREE` keep the desktop variants
 * as the named export to avoid breaking existing imports; the helper
 * `getDefaultFeedTree(device)` / `getDefaultWatchTree(device)` is the
 * supported way to look up by device.
 */
import type { BlockNode } from './types'
import type { Device } from '@/types'

// ── Desktop ─────────────────────────────────────────────────────────

/** YouTube-classic feed: 4-column grid; cards with thumbnail above + meta row below. */
const DESKTOP_FEED: BlockNode = {
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
              { id: 'card-thumb', type: 'Thumbnail',
                props: { aspect: '16/9', showDuration: true, borderRadius: '12px' } },
              {
                id: 'card-meta',
                type: 'Grid',
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  { id: 'card-avatar', type: 'ChannelAvatar', props: { size: 36, shape: 'circle' } },
                  {
                    id: 'card-text',
                    type: 'Stack',
                    props: { gap: '2px' },
                    children: [
                      { id: 'card-title', type: 'VideoTitle',
                        props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                      { id: 'card-channel', type: 'VideoChannel',
                        props: { fontSize: '12px', color: '#606060' } },
                      { id: 'card-views', type: 'VideoViews',
                        props: { fontSize: '12px', color: '#606060' } },
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
 */
const DESKTOP_WATCH: BlockNode = {
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
              { id: 'title', type: 'VideoTitle',
                props: { fontSize: '20px', fontWeight: '600', lines: 2, color: '#0f0f0f' } },
              {
                id: 'meta-row',
                type: 'Grid',
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
                  { id: 'channel-name', type: 'VideoChannel',
                    props: { fontSize: '14px', color: '#0f0f0f' } },
                ],
              },
              { id: 'desc', type: 'VideoDescription',
                props: { lineClamp: 3, expandable: true, fontSize: '14px' } },
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
                  props: { columnsTemplate: '168px 1fr', gap: '8px' },
                  children: [
                    { id: 'related-thumb', type: 'Thumbnail',
                      props: { aspect: '16/9', showDuration: true, borderRadius: '8px' } },
                    {
                      id: 'related-meta',
                      type: 'Stack',
                      props: { gap: '2px' },
                      children: [
                        { id: 'related-title', type: 'VideoTitle',
                          props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                        { id: 'related-channel', type: 'VideoChannel',
                          props: { fontSize: '12px', color: '#606060' } },
                        { id: 'related-views', type: 'VideoViews',
                          props: { fontSize: '12px', color: '#606060' } },
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

// ── Tablet ──────────────────────────────────────────────────────────

/** Tablet feed: 2-column grid (matches the YouTube iPad layout). */
const TABLET_FEED: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '16px' },
  children: [
    {
      id: 'list',
      type: 'VideoList',
      props: { layout: 'grid', columns: 2, gap: '14px' },
      slots: {
        item: [
          {
            id: 'card',
            type: 'Stack',
            props: { gap: '8px' },
            children: [
              { id: 'card-thumb', type: 'Thumbnail',
                props: { aspect: '16/9', showDuration: true, borderRadius: '10px' } },
              {
                id: 'card-meta',
                type: 'Grid',
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  { id: 'card-avatar', type: 'ChannelAvatar', props: { size: 32, shape: 'circle' } },
                  {
                    id: 'card-text',
                    type: 'Stack',
                    props: { gap: '2px' },
                    children: [
                      { id: 'card-title', type: 'VideoTitle',
                        props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                      { id: 'card-channel', type: 'VideoChannel',
                        props: { fontSize: '12px', color: '#606060' } },
                      { id: 'card-views', type: 'VideoViews',
                        props: { fontSize: '12px', color: '#606060' } },
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

/** Tablet watch: same SplitColumn pattern but narrower sidebar. */
const TABLET_WATCH: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '16px' },
  children: [
    {
      id: 'split',
      type: 'SplitColumn',
      props: { sidebarPosition: 'right', sidebarWidth: '280px', gap: '16px' },
      slots: {
        main: [
          {
            id: 'main-stack',
            type: 'Stack',
            props: { gap: '10px' },
            children: [
              { id: 'player', type: 'VideoPlayer', props: { aspect: '16/9' } },
              { id: 'title', type: 'VideoTitle',
                props: { fontSize: '18px', fontWeight: '600', lines: 2, color: '#0f0f0f' } },
              {
                id: 'meta-row',
                type: 'Grid',
                props: { columnsTemplate: '1fr auto', gap: '12px' },
                children: [
                  { id: 'views', type: 'VideoViews', props: { fontSize: '13px', color: '#606060' } },
                  { id: 'actions', type: 'VideoActions', props: { showLike: true, showDislike: true } },
                ],
              },
              {
                id: 'channel-row',
                type: 'Grid',
                props: { columnsTemplate: 'auto 1fr', gap: '8px' },
                children: [
                  { id: 'channel-avatar', type: 'ChannelAvatar', props: { size: 28, shape: 'circle' } },
                  { id: 'channel-name', type: 'VideoChannel',
                    props: { fontSize: '13px', color: '#0f0f0f' } },
                ],
              },
              { id: 'desc', type: 'VideoDescription',
                props: { lineClamp: 3, expandable: true, fontSize: '13px' } },
              { id: 'comments', type: 'CommentList', props: { defaultExpanded: true } },
            ],
          },
        ],
        sidebar: [
          {
            id: 'related-list',
            type: 'VideoList',
            props: { layout: 'list', gap: '10px' },
            slots: {
              item: [
                {
                  id: 'related-card',
                  type: 'Grid',
                  props: { columnsTemplate: '120px 1fr', gap: '8px' },
                  children: [
                    { id: 'related-thumb', type: 'Thumbnail',
                      props: { aspect: '16/9', showDuration: true, borderRadius: '6px' } },
                    {
                      id: 'related-meta',
                      type: 'Stack',
                      props: { gap: '2px' },
                      children: [
                        { id: 'related-title', type: 'VideoTitle',
                          props: { fontSize: '12px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                        { id: 'related-channel', type: 'VideoChannel',
                          props: { fontSize: '11px', color: '#606060' } },
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

// ── Mobile ──────────────────────────────────────────────────────────

/**
 * Mobile feed: single-column list. Each card is a full-width 16:9
 * thumbnail with the meta row directly under it (matching the YouTube
 * iPhone layout — no left rail, no multi-column grid).
 */
const MOBILE_FEED: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '0px' },
  children: [
    {
      id: 'list',
      type: 'VideoList',
      props: { layout: 'list', gap: '12px' },
      slots: {
        item: [
          {
            id: 'card',
            type: 'Stack',
            props: { gap: '8px' },
            children: [
              { id: 'card-thumb', type: 'Thumbnail',
                props: { aspect: '16/9', showDuration: true, borderRadius: '0px' } },
              {
                id: 'card-meta',
                type: 'Grid',
                props: { columnsTemplate: 'auto 1fr', gap: '10px', padding: '0 12px' },
                children: [
                  { id: 'card-avatar', type: 'ChannelAvatar', props: { size: 36, shape: 'circle' } },
                  {
                    id: 'card-text',
                    type: 'Stack',
                    props: { gap: '2px' },
                    children: [
                      { id: 'card-title', type: 'VideoTitle',
                        props: { fontSize: '15px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                      { id: 'card-channel', type: 'VideoChannel',
                        props: { fontSize: '12px', color: '#606060' } },
                      { id: 'card-views', type: 'VideoViews',
                        props: { fontSize: '12px', color: '#606060' } },
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
 * Mobile watch: no sidebar — player at top, then meta + actions, then
 * description, then comments + a related list stacked below. Topology
 * differs from desktop intentionally; this is what real iPhone apps do.
 */
const MOBILE_WATCH: BlockNode = {
  id: 'root',
  type: 'Page',
  props: { background: '#ffffff', padding: '0px' },
  children: [
    { id: 'player', type: 'VideoPlayer', props: { aspect: '16/9' } },
    {
      id: 'meta',
      type: 'Stack',
      props: { gap: '10px', padding: '12px' },
      children: [
        { id: 'title', type: 'VideoTitle',
          props: { fontSize: '16px', fontWeight: '600', lines: 2, color: '#0f0f0f' } },
        {
          id: 'channel-row',
          type: 'Grid',
          props: { columnsTemplate: 'auto 1fr auto', gap: '8px' },
          children: [
            { id: 'channel-avatar', type: 'ChannelAvatar', props: { size: 32, shape: 'circle' } },
            { id: 'channel-name', type: 'VideoChannel',
              props: { fontSize: '13px', color: '#0f0f0f' } },
            { id: 'actions', type: 'VideoActions', props: { showLike: true, showDislike: true } },
          ],
        },
        { id: 'desc', type: 'VideoDescription',
          props: { lineClamp: 2, expandable: true, fontSize: '13px' } },
        { id: 'comments', type: 'CommentList', props: { defaultExpanded: false } },
      ],
    },
    // Related list stacked at the bottom (no sidebar).
    {
      id: 'related-list',
      type: 'VideoList',
      props: { layout: 'list', gap: '8px' },
      slots: {
        item: [
          {
            id: 'related-card',
            type: 'Grid',
            props: { columnsTemplate: '160px 1fr', gap: '8px', padding: '0 12px' },
            children: [
              { id: 'related-thumb', type: 'Thumbnail',
                props: { aspect: '16/9', showDuration: true, borderRadius: '6px' } },
              {
                id: 'related-meta',
                type: 'Stack',
                props: { gap: '2px' },
                children: [
                  { id: 'related-title', type: 'VideoTitle',
                    props: { fontSize: '13px', fontWeight: '500', lines: 2, color: '#0f0f0f' } },
                  { id: 'related-channel', type: 'VideoChannel',
                    props: { fontSize: '11px', color: '#606060' } },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
}

// ── Public API ──────────────────────────────────────────────────────

/** Backwards-compat alias — desktop is the named export. */
export const DEFAULT_FEED_TREE = DESKTOP_FEED
export const DEFAULT_WATCH_TREE = DESKTOP_WATCH

const FEED_BY_DEVICE: Record<Device, BlockNode> = {
  desktop: DESKTOP_FEED,
  tablet: TABLET_FEED,
  mobile: MOBILE_FEED,
}

const WATCH_BY_DEVICE: Record<Device, BlockNode> = {
  desktop: DESKTOP_WATCH,
  tablet: TABLET_WATCH,
  mobile: MOBILE_WATCH,
}

/**
 * Return a fresh deep-copy of the device's default feed tree. The
 * editor mutates this state on edit, so each call yields a new clone
 * to prevent shared-reference contamination across templates.
 */
export function getDefaultFeedTree(device: Device): BlockNode {
  return JSON.parse(JSON.stringify(FEED_BY_DEVICE[device]))
}

export function getDefaultWatchTree(device: Device): BlockNode {
  return JSON.parse(JSON.stringify(WATCH_BY_DEVICE[device]))
}
