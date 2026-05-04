/**
 * Property panel for the selected block. Reads the block's `propSchema`
 * from the registry and dispatches each prop to its widget by `prop.type`.
 */
import type { BlockNode, PropDef } from '@/ui-runtime/blocks'
import { lookupBlock, blockDisplayName } from '@/ui-runtime/blocks'

interface PropertyPanelProps {
  selectedNode: BlockNode | null
  onChange: (key: string, value: unknown) => void
}

const ASPECT_OPTIONS = ['16/9', '9/16', '4/3', '1/1', '21/9']

export default function PropertyPanel({
  selectedNode,
  onChange,
}: PropertyPanelProps): JSX.Element {
  if (!selectedNode) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center">
        Select a block to edit its properties
      </div>
    )
  }
  const spec = lookupBlock(selectedNode.type)
  if (!spec) {
    return (
      <div className="p-4 text-sm text-red-400 text-center">
        Unknown block: {selectedNode.type}
      </div>
    )
  }
  if (spec.propSchema.length === 0) {
    return (
      <div>
        <Header spec={spec} selectedNode={selectedNode} />
        <div className="p-4 text-sm text-gray-400 text-center">
          No editable properties for this block
        </div>
      </div>
    )
  }

  const visibleProps = spec.propSchema.filter(
    (p) => !p.showWhen || p.showWhen(selectedNode.props),
  )
  return (
    <div>
      <Header spec={spec} selectedNode={selectedNode} />
      <div className="p-4 space-y-3">
        {visibleProps.map((prop) => (
          <PropertyRow
            key={prop.key}
            prop={prop}
            value={selectedNode.props[prop.key]}
            onChange={(v) => onChange(prop.key, v)}
          />
        ))}
      </div>
    </div>
  )
}

function Header({
  spec,
  selectedNode,
}: {
  spec: { type: string; description?: string }
  selectedNode: BlockNode
}): JSX.Element {
  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Properties
      </div>
      <div className="text-sm text-gray-900 mt-0.5">
        {blockDisplayName(spec.type as never)}{' '}
        <span className="text-[10px] font-mono text-gray-400">· {selectedNode.id}</span>
      </div>
      {spec.description && (
        <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{spec.description}</p>
      )}
    </div>
  )
}

function PropertyRow({
  prop,
  value,
  onChange,
}: {
  prop: PropDef
  value: unknown
  onChange: (v: unknown) => void
}): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-gray-500 w-[80px] shrink-0 pt-1.5">{prop.label}</span>
      <div className="flex-1 min-w-0">
        <PropertyWidget prop={prop} value={value} onChange={onChange} />
      </div>
    </div>
  )
}

function PropertyWidget({
  prop,
  value,
  onChange,
}: {
  prop: PropDef
  value: unknown
  onChange: (v: unknown) => void
}): JSX.Element {
  const strVal = value !== undefined && value !== null ? String(value) : ''

  switch (prop.type) {
    case 'color':
      return (
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={strVal || '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5"
          />
          <input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
          />
        </div>
      )

    case 'size':
      return (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0px"
            className="flex-1 h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
          />
          {prop.unit && <span className="text-[11px] text-gray-400">{prop.unit}</span>}
        </div>
      )

    case 'select':
      return (
        <select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 border border-gray-200 rounded text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white"
        >
          {prop.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : Number(strVal) || 0}
          min={prop.min}
          max={prop.max}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 text-center focus:outline-none focus:border-blue-400"
        />
      )

    case 'shadow':
      return (
        <select
          value={strVal || 'none'}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 border border-gray-200 rounded text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white"
        >
          <option value="none">None</option>
          <option value="0 1px 2px rgba(0,0,0,0.05)">Small</option>
          <option value="0 1px 3px rgba(0,0,0,0.1)">Medium</option>
          <option value="0 4px 12px rgba(0,0,0,0.1)">Large</option>
        </select>
      )

    case 'aspect': {
      const isCustom = strVal !== '' && !ASPECT_OPTIONS.includes(strVal)
      return (
        <div className="flex items-center gap-1">
          <select
            value={isCustom ? '__custom__' : strVal}
            onChange={(e) => {
              const next = e.target.value
              if (next === '__custom__') return
              onChange(next)
            }}
            className="h-7 px-2 border border-gray-200 rounded text-xs text-gray-700 focus:outline-none focus:border-blue-400 bg-white"
          >
            {ASPECT_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="__custom__">Custom</option>
          </select>
          {(isCustom || strVal === '') && (
            <input
              type="text"
              value={strVal}
              placeholder="e.g. 3/2"
              onChange={(e) => onChange(e.target.value)}
              className="w-20 h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
            />
          )}
        </div>
      )
    }

    case 'layout':
      return (
        <div className="flex gap-1">
          {(['grid', 'list'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`h-7 px-3 text-xs font-medium rounded border transition-colors ${
                strVal === opt
                  ? 'bg-blue-50 text-blue-700 border-blue-400'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )

    case 'toggle': {
      const checked = value === true || value === 'true'
      return (
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className="relative w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 transition-colors">
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                checked ? 'translate-x-4' : ''
              }`}
            />
          </div>
        </label>
      )
    }

    case 'spacing-shorthand':
      return (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 16px or 8px 16px"
          className="w-full h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
        />
      )

    case 'font':
      return (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Inter, sans-serif"
          className="w-full h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
        />
      )

    case 'alignment':
      return (
        <div className="flex gap-1">
          {(['start', 'center', 'end', 'stretch'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`h-7 px-2 text-xs font-medium rounded border transition-colors ${
                strVal === opt
                  ? 'bg-blue-50 text-blue-700 border-blue-400'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )

    case 'text':
    default:
      return (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-7 px-2 border border-gray-200 rounded text-xs font-mono text-gray-700 focus:outline-none focus:border-blue-400"
        />
      )
  }
}
