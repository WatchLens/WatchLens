/**
 * Feed page dispatcher. Reads the user's `ui_config.feed` and decides
 * which UI to render:
 *
 *   built-in keys (`'youtube'`, `'tiktok'`)  → React preset component
 *   `'none'`                                  → redirect to first watch
 *                                                video (TikTok-style "no
 *                                                feed page" experience)
 *   any other key (UUID)                      → admin-authored UI
 *                                                template, dispatched by
 *                                                template_type
 *
 * The dispatcher itself owns no UI; tracking comes from each preset's
 * (or template's) own surface primitives.
 */
import { Navigate } from 'react-router-dom'
import { useFeed, useUser } from '@/ui-runtime/data'
import { useCustomTemplate } from '@/hooks/useCustomTemplate'
import CompiledUI from '@/ui-runtime/CompiledUI'
import { BlockTreeRenderer } from '@/ui-runtime/blocks'
import Header from '@/components/layout/Header'
import { FEED_PRESETS, isBuiltinFeedKey } from '@/ui-presets/registry'


function LoadingScreen(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  )
}


/** `feed: 'none'` flow — fetch one recommendation and forward the
 *  user to its watch URL on mount. The first request emits the same
 *  HOME_FEED / IMPRESSION events as a normal feed mount; only the
 *  visual feed surface is skipped. */
function FeedNoneRedirect(): JSX.Element {
  const { videos, isLoading } = useFeed({ limit: 1 })
  if (isLoading) return <LoadingScreen />
  if (videos.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        No videos available for this experiment yet.
      </div>
    )
  }
  return <Navigate to={`/watch/${videos[0].video_id}`} replace />
}


/** Admin-authored UI template renderer. Resolves the row by id, then
 *  picks the renderer based on `template_type`:
 *    - `'code'` → in-browser sucrase compile via <CompiledUI>
 *    - `'tree'` → block tree walked by <BlockTreeRenderer>
 *  Header (platform chrome) sits outside the template's authoring
 *  surface. */
function TemplateFeed({ templateId }: { templateId: string }): JSX.Element {
  const { data: template, isLoading } = useCustomTemplate(templateId)
  if (isLoading) return <LoadingScreen />
  if (!template) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        UI template "{templateId}" not found or not published.
      </div>
    )
  }
  if (template.template_type === 'code' && template.code_text) {
    return <CompiledUI source={template.code_text} />
  }
  if (template.template_type === 'tree' && template.feed_tree) {
    return (
      <>
        <Header />
        <main className="pt-14">
          <BlockTreeRenderer page="feed" tree={template.feed_tree} />
        </main>
      </>
    )
  }
  return (
    <div className="min-h-screen flex items-center justify-center text-red-500">
      UI template "{template.name}" has no feed renderer (no code_text or feed_tree).
    </div>
  )
}


export default function Feed(): JSX.Element {
  const user = useUser()

  if (user.isLoading) return <LoadingScreen />

  const ui = user.ui_config
  if (!ui) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        No UI config — user must be assigned to a group with ui_config.
      </div>
    )
  }

  if (ui.feed === 'none') {
    return <FeedNoneRedirect />
  }

  if (isBuiltinFeedKey(ui.feed)) {
    const { Component } = FEED_PRESETS[ui.feed]
    return <Component />
  }

  // Treat any other key as a ui_templates.id UUID.
  return <TemplateFeed templateId={ui.feed} />
}
