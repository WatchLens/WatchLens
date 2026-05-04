/**
 * Watch page dispatcher. Mirrors `Feed.tsx`:
 *
 *   built-in keys (`'youtube'`, `'tiktok'`) → React preset component
 *   any other key (UUID)                    → admin-authored UI
 *                                              template, dispatched by
 *                                              template_type
 *
 * `'none'` is intentionally not a valid watch key — the watch page
 * always needs a renderer. The schema validator on the backend
 * rejects `ui_config.watch = 'none'` at group save time.
 */
import { useUser } from '@/ui-runtime/data'
import { useCustomTemplate } from '@/hooks/useCustomTemplate'
import CompiledUI from '@/ui-runtime/CompiledUI'
import { BlockTreeRenderer } from '@/ui-runtime/blocks'
import Header from '@/components/layout/Header'
import { WATCH_PRESETS, isBuiltinWatchKey } from '@/ui-presets/registry'


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

  if (user.isLoading) return <LoadingScreen />

  const ui = user.ui_config
  if (!ui) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        No UI config — user must be assigned to a group with ui_config.
      </div>
    )
  }

  if (isBuiltinWatchKey(ui.watch)) {
    const { Component } = WATCH_PRESETS[ui.watch]
    return <Component />
  }

  return <TemplateWatch templateId={ui.watch} />
}
