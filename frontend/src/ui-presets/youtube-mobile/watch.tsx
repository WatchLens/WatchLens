/**
 * YouTube preset — mobile watch. No sidebar — the layout stacks player
 * → meta → comments → related list vertically (matches what real iPhone
 * apps do). Thin BlockTreeRenderer wrapper around
 * `getDefaultWatchTree('mobile')`.
 */
import Header from '@/components/layout/Header'
import { BlockTreeRenderer, getDefaultWatchTree } from '@/ui-runtime/blocks'

const TREE = getDefaultWatchTree('mobile')

export default function YoutubeMobileWatch(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="watch" tree={TREE} />
      </main>
    </div>
  )
}
