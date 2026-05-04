/**
 * Renders TSX code authored at runtime (the "code track").
 *
 * Compiles the source on every prop change with sucrase, catches both
 * compile-time and render-time errors, and shows a researcher-friendly
 * error panel instead of crashing the participant's session.
 *
 * The compile result is memoized on the source string so re-renders of
 * the parent don't re-compile unless the code changed.
 */
import { Component, ErrorInfo, ReactNode, useMemo } from 'react'
import { compileTSX, CompileError } from './compile'

interface CompiledUIProps {
  source: string
  /** Optional fallback while the compiled component is mounting / resolving data. */
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

class RenderErrorBoundary extends Component<
  { children: ReactNode; onError?: (error: Error, info: ErrorInfo) => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  render(): ReactNode {
    if (this.state.error) {
      return <ErrorPanel title="Render error" message={this.state.error.message} />
    }
    return this.props.children
  }
}

function ErrorPanel({ title, message, source }: { title: string; message: string; source?: string }): JSX.Element {
  return (
    <div className="min-h-screen flex items-start justify-center p-8 bg-red-50 dark:bg-red-950/40">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-900 rounded-lg shadow-lg overflow-hidden">
        <div className="px-5 py-3 bg-red-600 text-white font-semibold">
          {title}
        </div>
        <pre className="p-5 text-sm text-red-900 dark:text-red-200 whitespace-pre-wrap break-words">
          {message}
        </pre>
        {source && (
          <details className="px-5 pb-5 text-xs text-gray-600 dark:text-gray-400">
            <summary className="cursor-pointer">Show source</summary>
            <pre className="mt-2 max-h-64 overflow-auto bg-gray-50 dark:bg-gray-800 p-3 rounded">{source}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

export default function CompiledUI({ source, fallback }: CompiledUIProps): JSX.Element {
  const compiled = useMemo(() => {
    try {
      return { kind: 'ok' as const, Component: compileTSX(source).Component }
    } catch (e) {
      if (e instanceof CompileError) {
        return { kind: 'err' as const, message: e.message, source: e.source }
      }
      return { kind: 'err' as const, message: (e as Error).message, source }
    }
  }, [source])

  if (compiled.kind === 'err') {
    return <ErrorPanel title="Compile error" message={compiled.message} source={compiled.source} />
  }

  const { Component } = compiled
  return (
    <RenderErrorBoundary>
      {fallback ? (
        <>
          <Component />
        </>
      ) : (
        <Component />
      )}
    </RenderErrorBoundary>
  )
}
