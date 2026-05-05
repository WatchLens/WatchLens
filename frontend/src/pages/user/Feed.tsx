/**
 * Feed page dispatcher. Reads the user's `ui_config.feed` (a flat key)
 * and renders the matching UI:
 *
 *   built-in keys (`'youtube'`, `'tiktok'`)  → React preset component
 *   `'none'`                                  → redirect to first watch
 *                                                video (TikTok-style "no
 *                                                feed page" experience)
 *   any other key (UUID)                      → admin-authored UI
 *                                                template, dispatched by
 *                                                template_type
 *
 * Before any of that, the dispatcher checks the participant's actual
 * viewport against their group's assigned `device`. A mismatch
 * (e.g. mobile viewport but group is `desktop`) returns the mismatch
 * notice — silently scaling a 1280px-authored UI down would change
 * the experimental treatment.
 *
 * The dispatcher itself owns no UI; tracking comes from each preset's
 * (or template's) own surface primitives.
 */
import { Navigate } from 'react-router-dom'
import { useFeed, useUser } from '@/ui-runtime/data'
import { useCustomTemplate } from '@/hooks/useCustomTemplate'
import { useDevice } from '@/hooks/useDevice'
import CompiledUI from '@/ui-runtime/CompiledUI'
import { BlockTreeRenderer } from '@/ui-runtime/blocks'
import Header from '@/components/layout/Header'
import { FEED_PRESETS, isBuiltinFeedKey } from '@/ui-presets/registry'
import DeviceMismatchNotice from './DeviceMismatchNotice'


function LoadingScreen(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  )
}


/** `feed: 'none'` flow — fetch one recommendation and forward the
 *  user to its watch URL on mount. */
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


/** Admin-authored UI template renderer. */
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
  const detectedDevice = useDevice()

  if (user.isLoading) return <LoadingScreen />

  const ui = user.ui_config
  if (!ui) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        No UI config — user must be assigned to a group with ui_config.
      </div>
    )
  }

  // Device mismatch check. Group's device is the experimental treatment;
  // viewport that doesn't match it gets blocked rather than rendering a
  // scaled-down UI.
  const expected = user.device
  if (expected && expected !== detectedDevice) {
    return <DeviceMismatchNotice detected={detectedDevice} expected={expected} />
  }

  const key = ui.feed
  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        No feed UI configured for this group.
      </div>
    )
  }

  if (key === 'none') {
    return <FeedNoneRedirect />
  }

  if (isBuiltinFeedKey(key)) {
    const { Component } = FEED_PRESETS[key]
    return <Component />
  }

  return <TemplateFeed templateId={key} />
}
