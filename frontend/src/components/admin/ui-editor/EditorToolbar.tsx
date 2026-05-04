import type { PageTab, EditorMode, Viewport } from './types'

interface EditorToolbarProps {
  templateName: string
  activeTab: PageTab
  mode: EditorMode
  viewport: Viewport
  isDirty: boolean
  status: string
  isSaving: boolean
  onTabChange: (tab: PageTab) => void
  onModeChange: (mode: EditorMode) => void
  onViewportChange: (viewport: Viewport) => void
  onSave: () => void
  onPublish: () => void
  onBack: () => void
}

export default function EditorToolbar({
  templateName,
  activeTab,
  mode,
  viewport,
  isDirty,
  status,
  isSaving,
  onTabChange,
  onModeChange,
  onViewportChange,
  onSave,
  onPublish,
  onBack,
}: EditorToolbarProps): JSX.Element {
  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0">
      {/* Back */}
      <button
        onClick={onBack}
        className="p-1.5 hover:bg-gray-100 rounded text-gray-500"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{templateName}</span>

      <div className="w-px h-6 bg-gray-200" />

      {/* Page Tabs */}
      <div className="flex bg-gray-100 rounded-md p-0.5 border border-gray-200">
        <button
          onClick={() => onTabChange('feed')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === 'feed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Feed Page
        </button>
        <button
          onClick={() => onTabChange('watch')}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            activeTab === 'watch' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Watch Page
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Mode Toggle */}
      <div className="flex bg-gray-100 rounded-md p-0.5 border border-gray-200">
        <button
          onClick={() => onModeChange('visual')}
          className={`px-3 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
            mode === 'visual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M1 5h14M5 5v10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Visual
        </button>
        <button
          onClick={() => onModeChange('code')}
          className={`px-3 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors ${
            mode === 'code' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M5 3L2 8l3 5M11 3l3 5-3 5M9 2l-2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Code
        </button>
      </div>

      {/* Viewport (only in visual mode) */}
      {mode === 'visual' && (
        <>
          <div className="w-px h-6 bg-gray-200" />
          <div className="flex gap-0.5">
            {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
              <button
                key={vp}
                onClick={() => onViewportChange(vp)}
                className={`w-7 h-7 flex items-center justify-center rounded border transition-colors ${
                  viewport === vp
                    ? 'bg-blue-50 text-blue-600 border-blue-300'
                    : 'bg-white text-gray-400 border-gray-200 hover:text-gray-600'
                }`}
                title={vp}
              >
                {vp === 'desktop' && (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M5 14h6M8 12v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
                {vp === 'tablet' && (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="8" cy="13" r="0.8" fill="currentColor" />
                  </svg>
                )}
                {vp === 'mobile' && (
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                    <rect x="4" y="1" width="8" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 12.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Spacer + Actions */}
      <div className="ml-auto flex items-center gap-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isDirty
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {isDirty ? 'Unsaved' : 'Saved'}
        </span>

        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={onPublish}
          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
            status === 'published'
              ? 'border border-orange-300 text-orange-700 hover:bg-orange-50'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
