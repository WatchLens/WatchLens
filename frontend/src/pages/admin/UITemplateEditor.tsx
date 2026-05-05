/**
 * UI template editor: visual mode authors block trees (Phase 4), code
 * mode authors raw TSX (Phase 3). The editor saves the active mode's
 * payload (`feed_tree`/`watch_tree` for visual; `code_text` for code)
 * along with `template_type` so the production dispatcher knows which
 * track to render.
 *
 * Legacy `feed_config` / `watch_config` (CSS-only on a fixed component
 * tree) is preserved on existing templates but no longer editable here.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUITemplate, updateUITemplate } from '@/api/admin'
import EditorToolbar from '@/components/admin/ui-editor/EditorToolbar'
import BlockTreeNodeEditor from '@/components/admin/ui-editor/BlockTreeNodeEditor'
import PreviewPanel from '@/components/admin/ui-editor/PreviewPanel'
import CodePanel from '@/components/admin/ui-editor/CodePanel'
import CompiledUI from '@/ui-runtime/CompiledUI'
import {
  DEFAULT_FEED_TREE,
  DEFAULT_WATCH_TREE,
  getDefaultFeedTree,
  getDefaultWatchTree,
  blockTreeToTSX,
} from '@/ui-runtime/blocks'
import type { BlockNode } from '@/ui-runtime/blocks'
import type { PageTab, EditorMode, Viewport } from '@/components/admin/ui-editor/types'
import type { Device } from '@/types'

const DEFAULT_CODE_TEMPLATE = `import { useFeed } from '@watchlens/data'
import { FeedSurface, VideoSurface } from '@watchlens/surfaces'

export default function MyFeed() {
  const { videos, isLoading } = useFeed({ limit: 12 })
  if (isLoading) return <div style={{ padding: 24 }}>Loading…</div>
  return (
    <FeedSurface videos={videos}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: 16 }}>
        {videos.map((v, i) => (
          <VideoSurface key={v.id} video={v} position={i} context="feed">
            <article>
              <div style={{ aspectRatio: '16/9', background: '#eee', borderRadius: 8 }} />
              <h3 style={{ marginTop: 8, fontSize: 14 }}>{v.title || 'Untitled'}</h3>
              <p style={{ fontSize: 12, color: '#666' }}>{v.channel_name}</p>
            </article>
          </VideoSurface>
        ))}
      </div>
    </FeedSurface>
  )
}
`


export default function UITemplateEditor(): JSX.Element {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Editor state
  const [activeTab, setActiveTab] = useState<PageTab>('feed')
  const [mode, setMode] = useState<EditorMode>('visual')
  // Device drives the preview viewport. One template = one device,
  // so changing here re-tags the template (saved on next Save).
  const [device, setDevice] = useState<Device>('desktop')
  const viewport: Viewport = device
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Card-group focus is its own state so the preview can stay zoomed
  // in on the card even when no specific atom is selected (admin
  // collapsed the inline panel).
  const [expandedCardGroupKey, setExpandedCardGroupKey] = useState<string | null>(null)

  // Block-tree state (visual mode)
  const [feedTree, setFeedTree] = useState<BlockNode>(DEFAULT_FEED_TREE)
  const [watchTree, setWatchTree] = useState<BlockNode>(DEFAULT_WATCH_TREE)
  const [feedCss, setFeedCss] = useState('')
  const [watchCss, setWatchCss] = useState('')
  const [codeText, setCodeText] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  // Fetch template
  const { data: template, isLoading } = useQuery({
    queryKey: ['ui-template', templateId],
    queryFn: () => getUITemplate(templateId!),
    enabled: !!templateId,
  })

  // Hydrate state from server. Default tree picks the device-matching
  // shape so a fresh tablet template opens at 2-col, mobile at 1-col,
  // etc.
  useEffect(() => {
    if (template) {
      const dev = template.device ?? 'desktop'
      setFeedTree((template.feed_tree as BlockNode | null) ?? getDefaultFeedTree(dev))
      setWatchTree((template.watch_tree as BlockNode | null) ?? getDefaultWatchTree(dev))
      setFeedCss(template.feed_css || '')
      setWatchCss(template.watch_css || '')
      setCodeText(template.code_text || DEFAULT_CODE_TEMPLATE)
      if (template.template_type === 'code') setMode('code')
      setDevice(dev)
      setSelectedId(null)
      setExpandedCardGroupKey(null)
      setIsDirty(false)
    }
  }, [template])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateUITemplate>[1]) =>
      updateUITemplate(templateId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ui-template', templateId] })
      setIsDirty(false)
    },
  })

  const buildSavePayload = useCallback(
    (extra: Parameters<typeof updateUITemplate>[1] = {}) => ({
      template_type: mode === 'code' ? ('code' as const) : ('tree' as const),
      device,
      feed_tree: mode === 'visual' ? feedTree : undefined,
      watch_tree: mode === 'visual' ? watchTree : undefined,
      feed_css: feedCss,
      watch_css: watchCss,
      code_text: codeText,
      ...extra,
    }),
    [mode, device, feedTree, watchTree, feedCss, watchCss, codeText],
  )

  const handleDeviceChange = useCallback(
    (next: Viewport) => {
      if (next === device) return
      // Switching device replaces the trees with the new device's
      // default — admin sees the topology that real platforms use at
      // that viewport (1-col mobile / 2-col tablet / 4-col desktop).
      // Confirm if there are unsaved edits so we don't silently
      // discard them.
      if (
        isDirty &&
        !window.confirm(
          `Switching device replaces the current trees with the ${next} default.\n\nUnsaved edits will be lost. Continue?`,
        )
      ) {
        return
      }
      setDevice(next)
      setFeedTree(getDefaultFeedTree(next))
      setWatchTree(getDefaultWatchTree(next))
      setSelectedId(null)
      setExpandedCardGroupKey(null)
      setIsDirty(true)
    },
    [device, isDirty],
  )

  const handleSave = useCallback(() => {
    saveMutation.mutate(buildSavePayload())
  }, [saveMutation, buildSavePayload])

  const handlePublish = useCallback(() => {
    const newStatus = template?.status === 'published' ? 'draft' : 'published'
    saveMutation.mutate(buildSavePayload({ status: newStatus }))
  }, [template, saveMutation, buildSavePayload])

  const handleCodeChange = useCallback((next: string) => {
    setCodeText(next)
    setIsDirty(true)
  }, [])

  const handleTreeChange = useCallback(
    (newTree: BlockNode) => {
      if (activeTab === 'feed') setFeedTree(newTree)
      else setWatchTree(newTree)
      setIsDirty(true)
    },
    [activeTab],
  )

  const handleCssChange = useCallback(
    (css: string) => {
      if (activeTab === 'feed') setFeedCss(css)
      else setWatchCss(css)
      setIsDirty(true)
    },
    [activeTab],
  )

  const currentTree = activeTab === 'feed' ? feedTree : watchTree
  const currentCss = activeTab === 'feed' ? feedCss : watchCss
  // (Property editing happens inline inside <BlockTreeNodeEditor>; that
  // component finds the selected node and applies updates against `tree`.)

  // Generated TSX: visual-mode preview / export / "eject to code" source.
  // Recomputed whenever either tree (or the template name) changes — the
  // pretty-print is cheap enough to do on every keystroke at this scale.
  const generatedCode = useMemo(
    () => blockTreeToTSX(feedTree, watchTree, { templateName: template?.name }),
    [feedTree, watchTree, template?.name],
  )
  const exportBaseName = useMemo(() => {
    const raw = (template?.name ?? 'custom-template').toLowerCase()
    const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    return slug || 'custom-template'
  }, [template?.name])

  const handleEjectToCode = useCallback(() => {
    setCodeText(generatedCode)
    setMode('code')
    setIsDirty(true)
  }, [generatedCode])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty) handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDirty, handleSave])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-gray-500">Loading template...</div>
      </div>
    )
  }
  if (!template) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-red-500">Template not found</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <EditorToolbar
        templateName={template.name}
        activeTab={activeTab}
        mode={mode}
        viewport={viewport}
        isDirty={isDirty}
        status={template.status}
        isSaving={saveMutation.isPending}
        onTabChange={(tab) => {
          setActiveTab(tab)
          setSelectedId(null)
        }}
        onModeChange={setMode}
        onViewportChange={handleDeviceChange}
        onSave={handleSave}
        onPublish={handlePublish}
        onBack={() => navigate('/admin/ui-custom')}
      />

      <div className="flex flex-1 min-h-0">
        {mode === 'code' ? (
          <>
            {/* Code mode: textarea (left) + live CompiledUI preview (right). */}
            <div className="flex-1 flex flex-col bg-[#1e1e2e] min-w-0">
              <div className="px-4 py-2 bg-[#181825] flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Code (TSX)
                </span>
                <span className="text-[10px] text-gray-500">
                  imports: <code className="text-gray-300">@watchlens/data</code>,{' '}
                  <code className="text-gray-300">@watchlens/surfaces</code>
                </span>
              </div>
              <textarea
                value={codeText}
                onChange={(e) => handleCodeChange(e.target.value)}
                spellCheck={false}
                className="flex-1 bg-[#1e1e2e] text-[#cdd6f4] p-4 text-xs font-mono leading-relaxed resize-none border-none outline-none"
                placeholder="// paste TSX here"
              />
            </div>
            <div className="flex-1 bg-gray-100 overflow-auto border-l border-gray-200 min-w-0">
              <div className="px-4 py-2 bg-white border-b border-gray-200 sticky top-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Live preview
                </span>
              </div>
              <CompiledUI key={codeText} source={codeText} mock />
            </div>
          </>
        ) : (
          <>
            {/* Visual mode: accordion-style tree (each row is a block; selected
                row expands to show its properties inline) on the left;
                preview center; raw CSS textarea right. */}
            <div className="w-[340px] border-r border-gray-200 flex flex-col overflow-hidden bg-white shrink-0">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Block tree
                </div>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Each row is one UI block. Click a row to expand it and edit its
                  properties. Drag a row onto another block to move it. Slot rows
                  (gray, ↳ prefix) hold child templates; click + to insert.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BlockTreeNodeEditor
                  tree={currentTree}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  expandedCardGroupKey={expandedCardGroupKey}
                  onCardGroupKeyChange={setExpandedCardGroupKey}
                  onChange={handleTreeChange}
                />
              </div>
            </div>

            <PreviewPanel
              activeTab={activeTab}
              viewport={viewport}
              tree={currentTree}
              css={currentCss}
              selectedId={selectedId}
              onSelect={setSelectedId}
              expandedCardGroupKey={expandedCardGroupKey}
            />

            <div className="w-[320px] border-l border-gray-200 shrink-0 flex flex-col overflow-hidden">
              <CodePanel
                generatedCode={generatedCode}
                exportBaseName={exportBaseName}
                css={currentCss}
                onCssChange={handleCssChange}
                onEjectToCode={handleEjectToCode}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
