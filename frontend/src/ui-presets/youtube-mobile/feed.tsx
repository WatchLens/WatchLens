/**
 * YouTube preset — mobile variant. Single-column list of full-width
 * 16:9 cards (matches the YouTube iPhone layout — no left rail, no
 * multi-column grid). Thin BlockTreeRenderer wrapper around
 * `getDefaultFeedTree('mobile')`; see `youtube-tablet/feed.tsx` for the
 * pattern rationale.
 */
import Header from '@/components/layout/Header'
import { BlockTreeRenderer, getDefaultFeedTree } from '@/ui-runtime/blocks'

const TREE = getDefaultFeedTree('mobile')

export default function YoutubeMobileFeed(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="feed" tree={TREE} />
      </main>
    </div>
  )
}
