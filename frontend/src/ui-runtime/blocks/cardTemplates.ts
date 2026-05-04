/**
 * Default card templates for VideoList.layout = 'grid' / 'list'.
 *
 * When the admin switches a VideoList's layout, the editor swaps the
 * slot.item content to the matching default. The admin can then edit
 * (font, color, atom presence, …) on top of the default — the layout
 * switch is a "starter template chooser", not a one-way lock.
 *
 * IDs are generated per-call so two cards in the same tree don't
 * collide.
 */
import type { BlockNode } from './types'
import { newNodeId } from './treeOps'

export function gridCardTemplate(): BlockNode {
  const t = (suffix: string): string => newNodeId(`card-${suffix}`)
  return {
    id: t('root'),
    type: 'Stack',
    props: { gap: '8px' },
    children: [
      {
        id: t('thumb'),
        type: 'Thumbnail',
        props: { aspect: '16/9', showDuration: true, borderRadius: '12px' },
      },
      {
        id: t('meta'),
        type: 'Grid',
        props: { columnsTemplate: 'auto 1fr', gap: '8px' },
        children: [
          {
            id: t('avatar'),
            type: 'ChannelAvatar',
            props: { size: 36, shape: 'circle' },
          },
          {
            id: t('text'),
            type: 'Stack',
            props: { gap: '2px' },
            children: [
              {
                id: t('title'),
                type: 'VideoTitle',
                props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
              },
              {
                id: t('channel'),
                type: 'VideoChannel',
                props: { fontSize: '12px', color: '#606060' },
              },
              {
                id: t('views'),
                type: 'VideoViews',
                props: { fontSize: '12px', color: '#606060' },
              },
            ],
          },
        ],
      },
    ],
  }
}

export function listCardTemplate(): BlockNode {
  const t = (suffix: string): string => newNodeId(`list-${suffix}`)
  return {
    id: t('root'),
    type: 'Grid',
    props: { columnsTemplate: '168px 1fr', gap: '12px' },
    children: [
      {
        id: t('thumb'),
        type: 'Thumbnail',
        props: { aspect: '16/9', showDuration: true, borderRadius: '8px' },
      },
      {
        id: t('text'),
        type: 'Stack',
        props: { gap: '4px' },
        children: [
          {
            id: t('title'),
            type: 'VideoTitle',
            props: { fontSize: '14px', fontWeight: '500', lines: 2, color: '#0f0f0f' },
          },
          {
            id: t('channel'),
            type: 'VideoChannel',
            props: { fontSize: '12px', color: '#606060' },
          },
          {
            id: t('views'),
            type: 'VideoViews',
            props: { fontSize: '12px', color: '#606060' },
          },
        ],
      },
    ],
  }
}
