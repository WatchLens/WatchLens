import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRecBoleStatus,
  getTrainingRuns,
  startTrainingRun,
  getRecBoleCoverage,
  clearRecBoleCache,
  getFallbackStats,
  importRecGraph,
} from '@/api/admin'
import type {
  TrainingRun,
  TrainingRunStatus,
  UserGroupSummary,
} from '@/types'

interface RecBoleTabProps {
  experimentId: string
  groups: UserGroupSummary[]
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${mins}m ${secs}s`
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return 'just now'
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatNumber(n: number | null): string {
  if (n === null) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function StatusBadge({ status }: { status: TrainingRunStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
          Pending
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Running
        </span>
      )
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Completed
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Failed
        </span>
      )
  }
}

function getLatestRun(runs: TrainingRun[], modelName: string): TrainingRun | undefined {
  return runs.find(r => r.model_name === modelName)
  // runs are already sorted by created_at DESC
}

export default function RecBoleTab({ experimentId, groups }: RecBoleTabProps): JSX.Element {
  const queryClient = useQueryClient()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const recGraphInputRef = useRef<HTMLInputElement>(null)

  // Queries
  const { data: status } = useQuery({
    queryKey: ['recbole-status'],
    queryFn: getRecBoleStatus,
  })

  const { data: runsData } = useQuery({
    queryKey: ['training-runs', experimentId],
    queryFn: () => getTrainingRuns(experimentId),
  })

  const { data: coverage } = useQuery({
    queryKey: ['training-coverage', experimentId],
    queryFn: () => getRecBoleCoverage(experimentId),
  })

  const { data: fallbackStats } = useQuery({
    queryKey: ['fallback-stats', experimentId],
    queryFn: () => getFallbackStats(experimentId),
    refetchInterval: 10000,
  })

  const hasActiveRun = runsData?.runs.some(
    (r) => r.status === 'running' || r.status === 'pending'
  )

  // Auto-refresh when training is active
  useEffect(() => {
    if (!hasActiveRun) return
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['training-runs', experimentId] })
      queryClient.invalidateQueries({ queryKey: ['training-coverage', experimentId] })
    }, 3000)
    return () => clearInterval(interval)
  }, [hasActiveRun, experimentId, queryClient])

  // Mutations
  const startMutation = useMutation({
    mutationFn: (params: { model_name: string; top_k: number }) =>
      startTrainingRun(experimentId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-runs', experimentId] })
    },
  })

  const clearCacheMutation = useMutation({
    mutationFn: () => clearRecBoleCache(experimentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-coverage', experimentId] })
    },
  })

  const importRecGraphMutation = useMutation({
    mutationFn: (file: File) => importRecGraph(experimentId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-coverage', experimentId] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {status && (
        <div className="bg-white rounded-lg shadow px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-sm text-gray-500">RecBole</span>
              <span className="ml-2 font-mono text-sm">{status.version || 'N/A'}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">PyTorch</span>
              <span className="ml-2 font-mono text-sm">{status.torch_version || 'N/A'}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">Device</span>
              <span className={`ml-2 font-mono text-sm ${status.cuda_available ? 'text-green-600' : ''}`}>
                {status.device.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-400">
            Scheduler: every {status.fit_period_minutes ?? 60}min
          </div>
        </div>
      )}

      {/* Group Model Status */}
      {groups.length > 0 && runsData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => {
            const feedModel = group.algorithm_config.feed === 'recbole'
              ? (group.config?.recbole_feed as Record<string, unknown>)?.model as string | undefined
              : null
            const watchModel = group.algorithm_config.watch === 'recbole'
              ? (group.config?.recbole_watch as Record<string, unknown>)?.model as string | undefined
              : null

            const feedRun = feedModel ? getLatestRun(runsData.runs, feedModel) : undefined
            const watchRun = watchModel ? getLatestRun(runsData.runs, watchModel) : undefined

            return (
              <div key={group.id} className="bg-white rounded-lg shadow p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-sm">{group.name}</h4>
                  <span className="text-xs text-gray-400">{group.user_count} users</span>
                </div>
                <div className="space-y-2 text-sm">
                  {feedModel && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mr-1.5">Feed</span>
                        {feedModel}
                      </span>
                      <div className="flex items-center gap-2">
                        {feedRun ? (
                          <>
                            <StatusBadge status={feedRun.status} />
                            <span className="text-xs text-gray-400">{formatTimeAgo(feedRun.completed_at || feedRun.started_at || feedRun.created_at)}</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not trained</span>
                        )}
                        <button
                          onClick={() => startMutation.mutate({
                            model_name: feedModel,
                            top_k: (group.config?.recbole_feed as Record<string, unknown>)?.top_k as number ?? 100,
                          })}
                          disabled={hasActiveRun || startMutation.isPending}
                          className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                        >
                          Train Now
                        </button>
                      </div>
                    </div>
                  )}
                  {watchModel && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">
                        <span className="text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded mr-1.5">Watch</span>
                        {watchModel}
                      </span>
                      <div className="flex items-center gap-2">
                        {watchRun ? (
                          <>
                            <StatusBadge status={watchRun.status} />
                            <span className="text-xs text-gray-400">{formatTimeAgo(watchRun.completed_at || watchRun.started_at || watchRun.created_at)}</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">Not trained</span>
                        )}
                        <button
                          onClick={() => startMutation.mutate({
                            model_name: watchModel,
                            top_k: (group.config?.recbole_watch as Record<string, unknown>)?.top_k as number ?? 50,
                          })}
                          disabled={hasActiveRun || startMutation.isPending}
                          className="text-xs text-purple-600 hover:text-purple-800 disabled:text-gray-300"
                        >
                          Train Now
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Coverage Cards */}
      {coverage && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-gray-500 text-sm">User Coverage</div>
            <div className="text-2xl font-bold mt-1">{coverage.user_coverage_percent}%</div>
            <div className="text-xs text-gray-400 mt-1">
              {coverage.users_with_recs} / {coverage.total_users} users
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-gray-500 text-sm">Item Coverage (I2I)</div>
            <div className="text-2xl font-bold mt-1">{coverage.item_coverage_percent}%</div>
            <div className="text-xs text-gray-400 mt-1">
              {coverage.items_with_sims} / {coverage.total_items} items
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-gray-500 text-sm">Cache</div>
            <div className="text-2xl font-bold mt-1">{formatNumber(coverage.cached_recommendations)}</div>
            <div className="text-xs text-gray-400 mt-1">
              recs + {formatNumber(coverage.cached_similarities)} sims
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-gray-500 text-sm">Last Training</div>
            <div className="text-2xl font-bold mt-1">
              {coverage.last_training_at ? formatTimeAgo(coverage.last_training_at) : 'Never'}
            </div>
            {coverage.cached_recommendations > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all cached recommendations and similarities?')) {
                    clearCacheMutation.mutate()
                  }
                }}
                className="text-xs text-red-500 hover:text-red-700 mt-1"
              >
                Clear cache
              </button>
            )}
          </div>
        </div>
      )}

      {/* Import Rec Graph */}
      <div className="bg-white rounded-lg shadow p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-sm">Import Rec Graph</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              CSV: source_video_id, recommended_video_id, position
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={recGraphInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) importRecGraphMutation.mutate(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => recGraphInputRef.current?.click()}
              disabled={importRecGraphMutation.isPending}
              className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {importRecGraphMutation.isPending ? 'Importing...' : 'Upload CSV'}
            </button>
          </div>
        </div>
        {importRecGraphMutation.isSuccess && (
          <div className="mt-3 text-sm text-green-600 bg-green-50 rounded p-2">
            Imported {(importRecGraphMutation.data as Record<string, number>).imported} pairs
            {(importRecGraphMutation.data as Record<string, number>).skipped > 0 && (
              <span className="text-gray-500"> ({(importRecGraphMutation.data as Record<string, number>).skipped} skipped)</span>
            )}
          </div>
        )}
        {importRecGraphMutation.isError && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 rounded p-2">
            {(importRecGraphMutation.error as Error).message || 'Import failed'}
          </div>
        )}
      </div>

      {/* Fallback Status */}
      {fallbackStats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium mb-4">Recommendation Serving Status</h4>
          <div className="grid grid-cols-2 gap-6">
            {/* Feed */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Feed ({fallbackStats.feed.total} requests)
              </div>
              <div className="space-y-1.5">
                {[
                  { key: 'cf', label: 'Stage 1: CF (RecBole)', color: 'bg-green-500' },
                  { key: 'i2i_history', label: 'Stage 2: I2I History', color: 'bg-blue-500' },
                  { key: 'popularity', label: 'Stage 3: Popularity', color: 'bg-yellow-500' },
                  { key: 'recency', label: 'Stage 4: Recency', color: 'bg-gray-400' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <div className="w-32 text-gray-500 text-xs">{label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className={`${color} h-full rounded-full transition-all`}
                        style={{ width: `${fallbackStats.feed.percentages[key] ?? 0}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-xs text-gray-500">
                      {fallbackStats.feed.percentages[key] ?? 0}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Watch */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Watch ({fallbackStats.watch.total} requests)
              </div>
              <div className="space-y-1.5">
                {[
                  { key: 'i2i', label: 'Stage 1: I2I (RecBole)', color: 'bg-green-500' },
                  { key: 'same_category', label: 'Stage 2: Same Category', color: 'bg-blue-500' },
                  { key: 'popularity', label: 'Stage 3: Popularity', color: 'bg-yellow-500' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <div className="w-32 text-gray-500 text-xs">{label}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className={`${color} h-full rounded-full transition-all`}
                        style={{ width: `${fallbackStats.watch.percentages[key] ?? 0}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-xs text-gray-500">
                      {fallbackStats.watch.percentages[key] ?? 0}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Resets on server restart. Shows which fallback stage fulfilled each request.
          </p>
        </div>
      )}

      {/* Training error */}
      {startMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600">
            {(startMutation.error as Error).message || 'Failed to start training'}
          </p>
        </div>
      )}

      {/* Training History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h4 className="font-medium">Training History</h4>
        </div>
        {runsData && runsData.runs.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Model
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Recall@{runsData.runs[0]?.top_k || 100}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  NDCG@{runsData.runs[0]?.top_k || 100}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Recs
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Started
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {runsData.runs.map((run) => (
                <TrainingRunRow
                  key={run.id}
                  run={run}
                  expanded={expandedRunId === run.id}
                  onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-12 text-center text-gray-400">
            No training runs yet. Use "Train Now" in the group cards above to start training.
          </div>
        )}
      </div>
    </div>
  )
}

function TrainingRunRow({
  run,
  expanded,
  onToggle,
}: {
  run: TrainingRun
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  const recallKey = Object.keys(run.metrics || {}).find((k) => k.toLowerCase().includes('recall'))
  const ndcgKey = Object.keys(run.metrics || {}).find((k) => k.toLowerCase().includes('ndcg'))

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <td className="px-6 py-3">
          <StatusBadge status={run.status} />
        </td>
        <td className="px-6 py-3 font-medium text-sm">{run.model_name}</td>
        <td className="px-6 py-3 text-sm text-gray-600">
          {formatNumber(run.interaction_count)}
        </td>
        <td className="px-6 py-3 text-sm text-gray-600">
          {recallKey && run.metrics ? run.metrics[recallKey].toFixed(4) : '-'}
        </td>
        <td className="px-6 py-3 text-sm text-gray-600">
          {ndcgKey && run.metrics ? run.metrics[ndcgKey].toFixed(4) : '-'}
        </td>
        <td className="px-6 py-3 text-sm text-gray-600">
          {formatNumber(run.recommendation_count)}
        </td>
        <td className="px-6 py-3 text-sm text-gray-600">
          {run.status === 'running'
            ? (() => {
                const elapsed = run.started_at
                  ? Math.floor((Date.now() - new Date(run.started_at).getTime()) / 1000)
                  : 0
                return `${elapsed}s...`
              })()
            : formatDuration(run.duration_seconds)}
        </td>
        <td className="px-6 py-3 text-sm text-gray-500">{formatTimeAgo(run.started_at || run.created_at)}</td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="px-6 py-4 bg-gray-50">
            <div className="grid grid-cols-2 gap-6 text-sm">
              {/* Metrics */}
              {run.metrics && Object.keys(run.metrics).length > 0 && (
                <div>
                  <div className="font-medium text-gray-700 mb-2">Metrics</div>
                  <div className="bg-white rounded p-3 space-y-1">
                    {Object.entries(run.metrics).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-500">{key}</span>
                        <span className="font-mono">{typeof value === 'number' ? value.toFixed(4) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hyperparameters */}
              <div>
                <div className="font-medium text-gray-700 mb-2">Hyperparameters</div>
                <div className="bg-white rounded p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">top_k</span>
                    <span className="font-mono">{run.top_k}</span>
                  </div>
                  {Object.entries(run.hyperparameters).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-500">{key}</span>
                      <span className="font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div>
                <div className="font-medium text-gray-700 mb-2">Data</div>
                <div className="bg-white rounded p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Interactions</span>
                    <span className="font-mono">{run.interaction_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Users</span>
                    <span className="font-mono">{run.user_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Items</span>
                    <span className="font-mono">{run.item_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Recommendations</span>
                    <span className="font-mono">{run.recommendation_count ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Similarities</span>
                    <span className="font-mono">{run.similarity_count ?? '-'}</span>
                  </div>
                </div>
              </div>

              {/* Error */}
              {run.error_message && (
                <div className="col-span-2">
                  <div className="font-medium text-red-700 mb-2">Error</div>
                  <pre className="bg-red-50 rounded p-3 text-xs text-red-800 whitespace-pre-wrap overflow-auto max-h-40">
                    {run.error_message}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
