/**
 * Watch page dispatcher. Mirrors `Feed.tsx`:
 *
 *   built-in keys (`'youtube'`, `'tiktok'`) → React preset component
 *   any other key (UUID)                    → admin-authored UI
 *                                              template, dispatched by
 *                                              template_type
 *
 * Like Feed, the dispatcher first checks viewport against the group's
 * assigned device. A mismatch returns the notice page rather than
 * scaling the UI.
 *
 * `'none'` is intentionally not a valid watch key — the watch page
 * always needs a renderer. The schema validator on the backend
 * rejects watch keys set to `'none'`.
 */
import { useUser } from '@/ui-runtime/data'
import { useCustomTemplate } from '@/hooks/useCustomTemplate'
import { useDevice } from '@/hooks/useDevice'
import CompiledUI from '@/ui-runtime/CompiledUI'
import { BlockTreeRenderer } from '@/ui-runtime/blocks'
import Header from '@/components/layout/Header'
import { WATCH_PRESETS, isBuiltinWatchKey } from '@/ui-presets/registry'
import DeviceMismatchNotice from './DeviceMismatchNotice'


function LoadingScreen(): JSX.Element {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center">
      <div className="text-gray-500 dark:text-gray-400">Loading...</div>
    </div>
  )
}


function TemplateWatch({ templateId }: { templateId: string }): JSX.Element {
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
  if (template.template_type === 'tree' && template.watch_tree) {
    return (
      <>
        <Header />
        <main className="pt-14">
          <BlockTreeRenderer page="watch" tree={template.watch_tree} />
        </main>
      </>
    )
  }
  return (
    <div className="min-h-screen flex items-center justify-center text-red-500">
      UI template "{template.name}" has no watch renderer (no code_text or watch_tree).
    </div>
  )
}


export default function VideoWatch(): JSX.Element {
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

  const expected = user.device
  if (expected && expected !== detectedDevice) {
    return <DeviceMismatchNotice detected={detectedDevice} expected={expected} />
  }

  const key = ui.watch
  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        No watch UI configured for this group.
      </div>
    )
  }

  if (isBuiltinWatchKey(key)) {
    const { Component } = WATCH_PRESETS[key]
    return <Component />
  }

  return <TemplateWatch templateId={key} />
}
