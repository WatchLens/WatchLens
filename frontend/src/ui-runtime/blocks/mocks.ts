/**
 * Mock data for the in-editor preview pane. Real production data
 * comes through `useFeed` / `useVideo` / `useRelated`; the editor
 * uses these constants instead so an admin can preview a tree
 * without the page being part of an experiment.
 *
 * The mock dataset deliberately includes a mix of channels, durations,
 * and view counts so layout choices (overflow, line clamping, badge
 * positioning) surface in preview.
 */
import type { Video } from '@/types'

function mockVideo(i: number, partial?: Partial<Video>): Video {
  return {
    id: i + 1,
    video_id: `mock-${i + 1}`,
    title: `Sample Video Title ${i + 1} — long enough to wrap on multiple lines`,
    url: '',
    resolved_url: null,
    thumbnail_url: null,
    video_type: 'mp4',
    duration: 60 + i * 47,
    category: 'Sample',
    tags: ['sample', `topic${i + 1}`],
    extra_metadata: null,
    view_count: 1000 * (i + 1),
    description:
      `Sample description for video ${i + 1}. This is a multi-line stand-in ` +
      'so the editor preview can exercise expandable description blocks ' +
      'and line-clamp behavior at realistic lengths.',
    like_count: 100 + i * 12,
    dislike_count: 0,
    comment_count: 5,
    channel_name: `Channel ${i + 1}`,
    channel_id: `ch-${i + 1}`,
    published_at: '2026-04-01T00:00:00Z',
    created_at: '2026-04-01T00:00:00Z',
    ...partial,
  }
}

export const MOCK_FEED_VIDEOS: Video[] = [
  mockVideo(0, { title: 'Recommendation Systems for Researchers', channel_name: 'AI Lab' }),
  mockVideo(1, { title: 'A/B Testing in HCI Studies', channel_name: 'UX Lab' }),
  mockVideo(2, { title: 'Building Research Platforms with Docker', channel_name: 'DevOps Today' }),
  mockVideo(3, { title: 'Engagement Metrics That Matter', channel_name: 'Data Science Weekly' }),
  mockVideo(4, { title: 'PostgreSQL for Event-Driven Systems', channel_name: 'Backend Weekly' }),
  mockVideo(5, { title: 'React Patterns for Scalable UIs', channel_name: 'Frontend Masters' }),
]

export const MOCK_RELATED_VIDEOS: Video[] = [
  mockVideo(10, { title: 'Advanced Recommendation Algorithms', channel_name: 'AI Lab' }),
  mockVideo(11, { title: 'User Study Design Patterns', channel_name: 'UX Lab' }),
  mockVideo(12, { title: 'Data Pipeline Architecture', channel_name: 'Backend Weekly' }),
]

/** Mock single video used as the watch-page bound video in editor preview. */
export const MOCK_PAGE_VIDEO: Video = mockVideo(99, {
  title: 'Watch-page Sample Video — descriptive multi-line title for preview',
  channel_name: 'Editor Preview',
  view_count: 25_400,
  description:
    'This is a stand-in description for the watch-page bound video. It is ' +
    'long enough to demonstrate description-block clamping and the expandable ' +
    'toggle. Researchers preview their watch-page block tree against this video.',
})
