/**
 * YouTube preset — tablet variant. The tablet feed uses a 2-column 16:9
 * grid (matching the YouTube iPad layout). The layout is the same shape
 * the editor seeds when an admin creates a fresh tablet template, so the
 * built-in is a thin BlockTreeRenderer wrapper around `getDefaultFeedTree('tablet')`.
 *
 * No infinite scroll today — that's a known limitation of
 * BlockTreeRenderer's FeedTreeRoot, which the desktop preset
 * (`<YoutubeDesktopFeed>`) handles with its own React component.
 * Researchers needing infinite scroll on tablet should ship a code-track
 * template.
 */
import Header from '@/components/layout/Header'
import { BlockTreeRenderer, getDefaultFeedTree } from '@/ui-runtime/blocks'

const TREE = getDefaultFeedTree('tablet')

export default function YoutubeTabletFeed(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f]">
      <Header />
      <main className="pt-14">
        <BlockTreeRenderer page="feed" tree={TREE} />
      </main>
    </div>
  )
}
