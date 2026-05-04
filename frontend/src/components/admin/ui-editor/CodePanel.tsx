/**
 * Right panel of the editor in visual mode.
 *
 * Top: generated TSX — the visual block tree pretty-printed as a
 * standalone TSX module (BlockTreeRenderer wrapper around inlined feed
 * and watch tree literals). Read-only preview; admins can copy it for
 * reference, download it as a `.tsx` file, or "eject" it into the
 * editor's code track so it becomes editable.
 *
 * Bottom: custom CSS textarea — raw CSS escape hatch saved as
 * `feed_css` / `watch_css` and injected by the dispatcher via a scoped
 * `<style>` tag in production.
 */
interface CodePanelProps {
  generatedCode: string
  /** Filename suggestion for the export download (without extension). */
  exportBaseName: string
  css: string
  onCssChange: (css: string) => void
  /** When set, the panel shows an "Eject to Code" action that asks for
   *  confirmation before populating the editor's codeText with the
   *  generated TSX and switching to Code mode. */
  onEjectToCode?: () => void
}

export default function CodePanel({
  generatedCode,
  exportBaseName,
  css,
  onCssChange,
  onEjectToCode,
}: CodePanelProps): JSX.Element {
  const handleCopy = (): void => {
    void navigator.clipboard.writeText(generatedCode)
  }

  const handleExport = (): void => {
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportBaseName}.tsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleEject = (): void => {
    if (!onEjectToCode) return
    const ok = window.confirm(
      'Eject to Code mode?\n\nThis copies the generated TSX into the code editor and switches the template to Code mode. The block trees stay in the database but the visual editor is no longer the source of truth — further edits happen as TSX.',
    )
    if (ok) onEjectToCode()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Generated TSX
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-0.5"
            title="Copy to clipboard"
          >
            Copy
          </button>
          <button
            onClick={handleExport}
            className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-0.5"
            title="Download as .tsx file"
          >
            Export
          </button>
          {onEjectToCode && (
            <button
              onClick={handleEject}
              className="text-[11px] text-blue-600 hover:text-blue-800 px-2 py-0.5 font-semibold"
              title="Switch this template to Code mode (irreversible UI flow)"
            >
              Eject →
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#1e1e2e] min-h-0">
        <pre className="p-4 text-[11px] leading-relaxed font-mono text-[#cdd6f4] whitespace-pre">
          {generatedCode}
        </pre>
      </div>

      <div className="border-t border-gray-700">
        <div className="flex items-center px-4 py-2 bg-[#181825]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Custom CSS Override
          </span>
        </div>
        <textarea
          value={css}
          onChange={(e) => onCssChange(e.target.value)}
          placeholder="/* Add custom CSS overrides here */"
          className="w-full h-40 bg-[#1e1e2e] text-[#cdd6f4] p-4 text-xs font-mono leading-relaxed resize-none border-none outline-none placeholder-gray-600"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
