/**
 * YouTube preset — tablet watch. Mirrors the desktop layout but with a
 * narrower sidebar (280px) and tighter padding, per `getDefaultWatchTree('tablet')`.
 * Thin BlockTreeRenderer wrapper — see `feed.tsx` for context.
 */
import Header from '@/components/layout/Header'
import { BlockTreeRenderer, getDefaultWatchTree } from '@/ui-runtime/blocks'

const TREE = getDefaultWatchTree('tablet')

export default function YoutubeTabletWatch(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="watch" tree={TREE} />
      </main>
    </div>
  )
}
