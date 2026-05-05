import { useState, FormEvent, ChangeEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getExperiment,
  updateExperiment,
  getUserGroups,
  createUserGroup,
  updateUserGroup,
  getUsers,
  bulkCreateUsers,
  downloadUsersCSV,
  getVideos,
  uploadVideosCSV,
  bulkDeleteVideos,
  getExperimentStats,
  getRecommendationEvaluation,
  downloadEventsCSV,
  getUITemplates,
  getRecommenders,
} from '@/api/admin'
import type {
  Experiment,
  ExperimentUpdateRequest,
  UserGroup,
  UserGroupCreateRequest,
  UserGroupUpdateRequest,
  UsersListResponse,
  UserBulkCreateRequest,
  UserBulkCreateResponse,
  VideoListResponse,
  VideoUploadResponse,
  StatsResponse,
  AlgorithmConfig,
  UIConfig,
  ExperimentStatus,
} from '@/types'

// UI Config Modal — flat (feed, watch) keys filtered by the group's
// device. Device assignment lives on the group itself (alembic 021),
// so this modal doesn't need device tabs anymore.
import { BUILTIN_UIS } from '@/ui-presets/registry'
import type { UIPresetInfo, Device } from '@/types/experiment'

interface UIConfigModalProps {
  isOpen: boolean
  onClose: () => void
  uiConfig: UIConfig
  /** The owning group's device — drives template filtering. */
  device: Device
  onSave: (config: UIConfig) => void
}

const DEVICE_LABEL: Record<Device, string> = {
  desktop: 'Desktop',
  tablet: 'Tablet',
  mobile: 'Mobile',
}

function UIConfigModal({ isOpen, onClose, uiConfig, device, onSave }: UIConfigModalProps): JSX.Element | null {
  const [config, setConfig] = useState<UIConfig>(uiConfig)

  // Fetch only templates whose device matches the group; built-ins are
  // desktop-only and filtered against the group's device below too.
  const { data: templates = [] } = useQuery({
    queryKey: ['ui-templates-published'],
    queryFn: () => getUITemplates('published'),
    enabled: isOpen,
  })

  if (!isOpen) return null

  const templateUIs: UIPresetInfo[] = templates.map((t) => ({
    key: t.id,
    kind: 'template',
    label: t.name,
    description: t.description || 'Admin-authored UI template.',
    supports_feed: true,
    supports_watch: true,
    devices: [t.device],
  }))
  const allUIs: UIPresetInfo[] = [...BUILTIN_UIS, ...templateUIs]

  const handleSave = (): void => {
    onSave(config)
    onClose()
  }

  const setSlot = (surface: 'feed' | 'watch', value: string): void => {
    setConfig((prev) => ({ ...prev, [surface]: value }))
  }

  const renderSlot = (
    surface: 'feed' | 'watch',
    label: string,
  ): JSX.Element => {
    const current = config[surface]

    // Filter: presets must list the group's device + support this surface.
    // YouTube desktop/tablet/mobile target one device each; `'none'` is
    // device-agnostic (redirects without rendering UI).
    const options = allUIs.filter((u) => {
      if (surface === 'feed' && !u.supports_feed) return false
      if (surface === 'watch' && !u.supports_watch) return false
      return u.devices.includes(device)
    })

    return (
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-1.5">
          {label}
        </div>
        {options.length === 0 ? (
          <div className="text-[11px] text-gray-400 py-2 px-3 bg-gray-50 rounded border border-dashed border-gray-200">
            No {DEVICE_LABEL[device]}-tagged templates published yet. Author one in UI Custom and tag it for {DEVICE_LABEL[device]}.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {options.map((ui) => (
              <button
                key={ui.key}
                type="button"
                title={ui.description}
                onClick={() => setSlot(surface, ui.key)}
                className={`text-left py-2 px-3 rounded-lg border-2 transition-colors ${
                  current === ui.key
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-sm">
                  {ui.label}
                  {ui.kind === 'template' && (
                    <span className="ml-1 text-[10px] text-gray-400 font-normal">(template)</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-1">UI Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">
          This group's device is{' '}
          <strong className="text-gray-700">{DEVICE_LABEL[device]}</strong>. Pick one
          UI per surface; only {DEVICE_LABEL[device]}-tagged options appear.
        </p>

        {renderSlot('feed', 'Feed Page')}
        {renderSlot('watch', 'Watch Page')}

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// Algorithm Config Modal Component

interface RecBoleModelConfig {
  model: string
  top_k: number
  hyperparameters?: Record<string, unknown>
}

interface AlgorithmConfigModalProps {
  isOpen: boolean
  onClose: () => void
  algorithmConfig: AlgorithmConfig
  groupConfig: Record<string, unknown> | null
  onSave: (
    config: AlgorithmConfig,
    groupConfig: Record<string, unknown> | null,
  ) => void
}

const feedModels = ['BPR', 'NeuMF', 'LightGCN', 'SASRec', 'GRU4Rec']
const watchModels = ['ItemKNN', 'EASE']

function RecBoleModelSection({
  label,
  modelConfig,
  onChange,
  models,
}: {
  label: string
  modelConfig: RecBoleModelConfig
  onChange: (config: RecBoleModelConfig) => void
  models: string[]
}) {
  return (
    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <div className="text-xs font-medium text-blue-700 mb-2">{label} Model</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {models.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...modelConfig, model: m })}
            className={`px-2.5 py-1 rounded text-xs transition-colors ${
              modelConfig.model === m
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-blue-600">Top K</label>
        <input
          type="number"
          min={1}
          max={1000}
          value={modelConfig.top_k}
          onChange={(e) => onChange({ ...modelConfig, top_k: parseInt(e.target.value) || 100 })}
          className="w-20 px-2 py-1 border border-blue-200 rounded text-xs"
        />
      </div>
    </div>
  )
}


function AlgorithmConfigModal({
  isOpen,
  onClose,
  algorithmConfig,
  groupConfig,
  onSave,
}: AlgorithmConfigModalProps): JSX.Element | null {
  const [config, setConfig] = useState<AlgorithmConfig>(algorithmConfig)
  const [feedModel, setFeedModel] = useState<RecBoleModelConfig>(
    (groupConfig?.recbole_feed as RecBoleModelConfig) || { model: 'BPR', top_k: 100 }
  )
  const [watchModel, setWatchModel] = useState<RecBoleModelConfig>(
    (groupConfig?.recbole_watch as RecBoleModelConfig) || { model: 'ItemKNN', top_k: 50 }
  )

  // Live recommender registry. Backend's `RECOMMENDERS` dict is the
  // single source of truth — adding a new policy server-side surfaces
  // here automatically. Filtered by capability flags so a watch-only
  // policy doesn't appear in the feed dropdown.
  const { data: recommenders = [] } = useQuery({
    queryKey: ['recommenders'],
    queryFn: getRecommenders,
    staleTime: 5 * 60 * 1000,
  })
  const feedAlgorithms = recommenders.filter((r) => r.supports_feed)
  const watchAlgorithms = recommenders.filter((r) => r.supports_watch)

  if (!isOpen) return null

  const usesRecboleFeed = config.feed === 'recbole'
  const usesRecboleWatch = config.watch === 'recbole'

  const handleSave = (): void => {
    const newGroupConfig: Record<string, unknown> = { ...(groupConfig || {}) }
    if (usesRecboleFeed) {
      newGroupConfig.recbole_feed = feedModel
    } else {
      delete newGroupConfig.recbole_feed
    }
    if (usesRecboleWatch) {
      newGroupConfig.recbole_watch = watchModel
    } else {
      delete newGroupConfig.recbole_watch
    }
    onSave(
      config,
      Object.keys(newGroupConfig).length > 0 ? newGroupConfig : null,
    )
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Algorithm Configuration</h3>

        {/* Feed Algorithm Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Feed Page Algorithm</label>
          <div className="grid grid-cols-4 gap-2">
            {feedAlgorithms.map((rec) => (
              <button
                key={rec.key}
                type="button"
                title={rec.description}
                onClick={() => setConfig({ ...config, feed: rec.key })}
                className={`py-2 px-1 rounded-lg border-2 transition-colors text-sm text-center ${
                  config.feed === rec.key
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {rec.label}
              </button>
            ))}
          </div>
          {config.feed === 'recbole' && (
            <RecBoleModelSection
              label="Feed"
              modelConfig={feedModel}
              onChange={setFeedModel}
              models={feedModels}
            />
          )}
        </div>

        {/* Watch Algorithm Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Watch Page Algorithm</label>
          <div className="grid grid-cols-6 gap-2">
            {watchAlgorithms.map((rec) => (
              <button
                key={rec.key}
                type="button"
                title={rec.description}
                onClick={() => setConfig({ ...config, watch: rec.key })}
                className={`py-2 px-3 rounded-lg border-2 transition-colors text-sm text-center col-span-2 ${
                  config.watch === rec.key
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {rec.label}
              </button>
            ))}
          </div>
          {config.watch === 'recbole' && (
            <>
              <RecBoleModelSection
                label="Watch (I2I)"
                modelConfig={watchModel}
                onChange={setWatchModel}
                models={watchModels}
              />

              <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-700">
                Falls back to popularity when training data is insufficient.
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// Helper to format UI config for display.
// Built-in keys (`youtube-{desktop,tablet,mobile}`, `tiktok-desktop`,
// `none`) get a friendly label; admin-authored UI templates (UUID
// keys) show as `Template:<8-char>`.
function formatUIKey(key: string): string {
  if (key === 'youtube-desktop') return 'YouTube (Desktop)'
  if (key === 'youtube-tablet') return 'YouTube (Tablet)'
  if (key === 'youtube-mobile') return 'YouTube (Mobile)'
  if (key === 'tiktok-desktop') return 'TikTok (Desktop)'
  if (key === 'none') return 'No feed'
  if (!key) return '—'
  // UUID — show short form so the row stays readable.
  return `Template:${key.slice(0, 8)}`
}

function formatUIConfig(uiConfig: UIConfig | null | undefined): string {
  if (!uiConfig) return 'F:— / W:—'
  return `F:${formatUIKey(uiConfig.feed)} / W:${formatUIKey(uiConfig.watch)}`
}

// Helper to format algorithm config for display
function formatAlgorithmConfig(algorithmConfig: AlgorithmConfig | null | undefined): string {
  if (!algorithmConfig) return 'F:random / W:random'
  const { feed = 'random', watch = 'random' } = algorithmConfig
  return `F:${feed} / W:${watch}`
}

// Format seconds → "12s" / "3m 4s" / "1h 5m". Used for watch time and
// session duration cells; both come from the backend in seconds.
function formatSeconds(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

// Collapsible card with a header that toggles visibility of children.
// Local state — no persistence; defaults to expanded.
function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  bodyClassName = 'p-6',
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  bodyClassName?: string
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 text-left"
      >
        <h4 className="font-medium">{title}</h4>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className={bodyClassName}>{children}</div>}
    </div>
  )
}

import RecBoleTab from './RecBoleTab'
import SurveysTab from './SurveysTab'
import UserStatusModal from '@/components/admin/UserStatusModal'

type TabType = 'overview' | 'groups' | 'users' | 'videos' | 'surveys' | 'stats' | 'recbole'

interface NewGroupState {
  name: string
  device: Device
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
  config: Record<string, unknown> | null
}

interface NewUsersState {
  user_group_id: string
  count: number
  prefix: string
}

export default function ExperimentDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [showGroupForm, setShowGroupForm] = useState<boolean>(false)
  const [showUserForm, setShowUserForm] = useState<boolean>(false)
  const [showUIModal, setShowUIModal] = useState<boolean>(false)
  const [showAlgorithmModal, setShowAlgorithmModal] = useState<boolean>(false)
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null)
  const [statusUser, setStatusUser] = useState<{ id: string; login_id: string } | null>(null)
  const [newGroup, setNewGroup] = useState<NewGroupState>({
    name: '',
    device: 'desktop',
    algorithm_config: { feed: 'random', watch: 'random' },
    ui_config: { feed: 'youtube-desktop', watch: 'youtube-desktop' },
    config: null,
  })
  const [newUsers, setNewUsers] = useState<NewUsersState>({
    user_group_id: '',
    count: 10,
    prefix: 'user',
  })
  const [createdUsers, setCreatedUsers] = useState<UserBulkCreateResponse | null>(null)

  // Video tab state
  const [videoPage, setVideoPage] = useState<number>(1)
  const [editMode, setEditMode] = useState<boolean>(false)
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set())

  // Queries
  const { data: experiment, isLoading } = useQuery<Experiment>({
    queryKey: ['experiment', id],
    queryFn: () => getExperiment(id!),
    enabled: !!id,
  })

  const { data: groups } = useQuery<UserGroup[]>({
    queryKey: ['userGroups', id],
    queryFn: () => getUserGroups(id!),
    enabled: !!id && (activeTab === 'groups' || activeTab === 'users'),
  })

  const { data: users } = useQuery<UsersListResponse>({
    queryKey: ['users', id],
    queryFn: () => getUsers(id!),
    enabled: !!id && activeTab === 'users',
  })

  const { data: videos } = useQuery<VideoListResponse>({
    queryKey: ['videos', id, videoPage],
    queryFn: () => getVideos(id!, videoPage, 100),
    enabled: !!id && activeTab === 'videos',
  })

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['stats', id],
    queryFn: () => getExperimentStats(id!),
    enabled: !!id && activeTab === 'stats',
  })

  const { data: evaluation } = useQuery({
    queryKey: ['eval', id],
    queryFn: () => getRecommendationEvaluation(id!),
    enabled: !!id && activeTab === 'stats',
  })


  // Mutations
  const updateMutation = useMutation<Experiment, Error, ExperimentUpdateRequest>({
    mutationFn: (data) => updateExperiment(id!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['experiment', id] }),
  })

  const createGroupMutation = useMutation<UserGroup, Error, UserGroupCreateRequest>({
    mutationFn: (data) => createUserGroup(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userGroups', id] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      setShowGroupForm(false)
      setNewGroup({
        name: '',
        device: 'desktop',
        algorithm_config: { feed: 'random', watch: 'random' },
        ui_config: { feed: 'youtube-desktop', watch: 'youtube-desktop' },
        config: null,
      })
    },
  })

  const updateGroupMutation = useMutation<UserGroup, Error, { groupId: string; data: UserGroupUpdateRequest }>({
    mutationFn: ({ groupId, data }) => updateUserGroup(groupId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userGroups', id] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      setEditingGroup(null)
    },
  })

  const createUsersMutation = useMutation<UserBulkCreateResponse, Error, UserBulkCreateRequest>({
    mutationFn: (data) => bulkCreateUsers(id!, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['users', id] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      setCreatedUsers(data)
    },
  })

  const uploadVideosMutation = useMutation<VideoUploadResponse, Error, File>({
    mutationFn: (file) => uploadVideosCSV(id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos', id] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
    },
  })

  const bulkDeleteVideosMutation = useMutation<{ deleted: number }, Error, number[]>({
    mutationFn: (videoIds) => bulkDeleteVideos(videoIds.map(String)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos', id] })
      queryClient.invalidateQueries({ queryKey: ['experiment', id] })
      setSelectedVideos(new Set())
      setEditMode(false)
    },
  })

  const handleStatusChange = (status: ExperimentStatus): void => {
    updateMutation.mutate({ status })
  }

  const handleCreateGroup = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const { config, ...rest } = newGroup
    createGroupMutation.mutate(config ? { ...rest, config } : rest)
  }

  const handleCreateUsers = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    createUsersMutation.mutate({
      user_group_id: newUsers.user_group_id,
      count: newUsers.count,
      prefix: newUsers.prefix,
    })
  }

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) {
      uploadVideosMutation.mutate(file)
    }
  }

  if (isLoading) {
    return <div className="text-gray-500">Loading...</div>
  }

  if (!experiment) {
    return <div className="text-red-500">Experiment not found</div>
  }

  const isCompleted = experiment.status === 'completed'

  const recboleGroups = experiment.user_groups.filter(
    g => g.algorithm_config.feed === 'recbole' || g.algorithm_config.watch === 'recbole'
  )
  const hasRecBole = recboleGroups.length > 0

  // Derive effective tab: fall back to overview if recbole tab is active but no groups use it
  const effectiveTab = (activeTab === 'recbole' && !hasRecBole) ? 'overview' : activeTab

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => navigate('/admin/experiments')}
            className="text-gray-500 hover:text-gray-700 text-sm mb-2"
          >
            &larr; Back to experiments
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{experiment.name}</h2>
          {experiment.description && <p className="text-gray-500 mt-1">{experiment.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={experiment.status}
            onChange={(e) => handleStatusChange(e.target.value as ExperimentStatus)}
            className="px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8">
          {(['overview', 'groups', 'users', 'videos', 'surveys', 'stats', 'recbole'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { if (tab !== 'recbole' || hasRecBole) setActiveTab(tab) }}
              className={`py-2 border-b-2 text-sm font-medium ${
                tab === 'recbole' && !hasRecBole
                  ? 'border-transparent text-gray-300 cursor-not-allowed'
                  : effectiveTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'recbole' ? 'RecBole' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {effectiveTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm">User Groups</div>
            <div className="text-3xl font-bold text-gray-900">{experiment.user_groups.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm">Total Users</div>
            <div className="text-3xl font-bold text-gray-900">{experiment.total_users}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-500 text-sm">Total Videos</div>
            <div className="text-3xl font-bold text-gray-900">{experiment.total_videos}</div>
          </div>
        </div>
      )}

      {effectiveTab === 'groups' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">User Groups</h3>
            <button
              onClick={() => setShowGroupForm(true)}
              disabled={isCompleted}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Group
            </button>
          </div>

          {showGroupForm && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <form onSubmit={handleCreateGroup} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    required
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., Control, Treatment_A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Device</label>
                  <select
                    value={newGroup.device}
                    onChange={(e) => {
                      const next = e.target.value as Device
                      // Switching device invalidates the current ui_config
                      // since templates / built-ins are device-tagged.
                      // Reset to the safe defaults for the new device.
                      setNewGroup({
                        ...newGroup,
                        device: next,
                        ui_config:
                          next === 'tablet'
                            ? { feed: 'youtube-tablet', watch: 'youtube-tablet' }
                            : next === 'mobile'
                              ? { feed: 'youtube-mobile', watch: 'youtube-mobile' }
                              : { feed: 'youtube-desktop', watch: 'youtube-desktop' },
                      })
                    }}
                    disabled={isCompleted}
                    className="mt-1 px-3 py-2 border border-gray-300 rounded-md disabled:opacity-50"
                  >
                    <option value="desktop">Desktop</option>
                    <option value="tablet">Tablet</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Algorithm</label>
                  <button
                    type="button"
                    onClick={() => setShowAlgorithmModal(true)}
                    disabled={isCompleted}
                    className="mt-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{formatAlgorithmConfig(newGroup.algorithm_config)}</span>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">UI</label>
                  <button
                    type="button"
                    onClick={() => setShowUIModal(true)}
                    disabled={isCompleted}
                    className="mt-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{formatUIConfig(newGroup.ui_config)}</span>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                </div>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowGroupForm(false)}
                  className="text-gray-500 px-4 py-2"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          <UIConfigModal
            isOpen={showUIModal}
            onClose={() => setShowUIModal(false)}
            uiConfig={newGroup.ui_config}
            device={newGroup.device}
            onSave={(config) => setNewGroup({ ...newGroup, ui_config: config })}
          />

          <AlgorithmConfigModal
            isOpen={showAlgorithmModal}
            onClose={() => setShowAlgorithmModal(false)}
            algorithmConfig={newGroup.algorithm_config}
            groupConfig={newGroup.config}
            onSave={(algoConfig, groupConfig) =>
              setNewGroup({
                ...newGroup,
                algorithm_config: algoConfig,
                config: groupConfig,
              })
            }
          />

          {editingGroup && (
            <AlgorithmConfigModal
              key={editingGroup.id}
              isOpen={true}
              onClose={() => setEditingGroup(null)}
              algorithmConfig={editingGroup.algorithm_config as AlgorithmConfig}
              groupConfig={(editingGroup.config as Record<string, unknown> | null) ?? null}
              onSave={(algoConfig, groupConfig) =>
                updateGroupMutation.mutate({
                  groupId: String(editingGroup.id),
                  data: {
                    algorithm_config: algoConfig,
                    config: groupConfig ?? undefined,
                  },
                })
              }
            />
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Device
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Algorithm
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    UI Config
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Users
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {groups?.map((group) => (
                  <tr key={group.id}>
                    <td className="px-6 py-4 font-medium">{group.name}</td>
                    <td className="px-6 py-4 text-gray-500 capitalize">{group.device}</td>
                    <td className="px-6 py-4 text-gray-500">
                      <div>{formatAlgorithmConfig(group.algorithm_config)}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatUIConfig(group.ui_config)}</td>
                    <td className="px-6 py-4">{group.user_count}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingGroup(group)}
                        disabled={isCompleted}
                        className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Edit algorithm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveTab === 'users' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Users ({users?.total || 0})</h3>
            <div className="flex gap-2">
              <button
                onClick={() => downloadUsersCSV(id!)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200"
              >
                Download CSV
              </button>
              <button
                onClick={() => setShowUserForm(true)}
                disabled={isCompleted}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Bulk Create
              </button>
            </div>
          </div>

          {showUserForm && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <form onSubmit={handleCreateUsers} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Group</label>
                  <select
                    required
                    value={newUsers.user_group_id}
                    onChange={(e) => setNewUsers({ ...newUsers, user_group_id: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select group</option>
                    {groups?.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Count</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={newUsers.count}
                    onChange={(e) => setNewUsers({ ...newUsers, count: parseInt(e.target.value) })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Prefix</label>
                  <input
                    type="text"
                    required
                    value={newUsers.prefix}
                    onChange={(e) => setNewUsers({ ...newUsers, prefix: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md">
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserForm(false)
                    setCreatedUsers(null)
                  }}
                  className="text-gray-500 px-4 py-2"
                >
                  Cancel
                </button>
              </form>

              {createdUsers && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
                  <div className="font-medium text-green-800 mb-2">
                    Created {createdUsers.created} users
                  </div>
                  <div className="text-sm text-green-700">Copy these credentials (shown only once):</div>
                  <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-40">
                    {createdUsers.users.map((u) => `${u.login_id},${u.password}`).join('\n')}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Login ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Group
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users?.users?.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4">{user.login_id}</td>
                    <td className="px-6 py-4 text-gray-500">{user.group_name}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {user.last_login ? new Date(/Z|[+-]\d\d:?\d\d$/.test(user.last_login) ? user.last_login : user.last_login + 'Z').toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setStatusUser({ id: String(user.id), login_id: user.login_id })}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {statusUser && (
            <UserStatusModal
              userId={statusUser.id}
              loginId={statusUser.login_id}
              onClose={() => setStatusUser(null)}
            />
          )}
        </div>
      )}

      {effectiveTab === 'videos' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Videos ({videos?.total || 0})</h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditMode(!editMode)
                  if (editMode) setSelectedVideos(new Set())
                }}
                disabled={isCompleted}
                className={`px-4 py-2 rounded-md ${
                  editMode
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
              <label className={`bg-blue-600 text-white px-4 py-2 rounded-md cursor-pointer ${
                isCompleted ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              }`}>
                Upload CSV
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={isCompleted} />
              </label>
            </div>
          </div>

          {uploadVideosMutation.isSuccess && uploadVideosMutation.data && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md text-green-800">
              Uploaded successfully: {uploadVideosMutation.data.created} created,{' '}
              {uploadVideosMutation.data.skipped} skipped
            </div>
          )}

          {editMode && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={videos?.videos?.length === selectedVideos.size && selectedVideos.size > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedVideos(new Set(videos?.videos?.map((v) => v.id) || []))
                      } else {
                        setSelectedVideos(new Set())
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">Select all on this page</span>
                </label>
                <span className="text-sm text-gray-500">{selectedVideos.size} selected</span>
              </div>
              <button
                onClick={() => {
                  if (selectedVideos.size > 0 && confirm(`Delete ${selectedVideos.size} videos?`)) {
                    bulkDeleteVideosMutation.mutate(Array.from(selectedVideos))
                  }
                }}
                disabled={selectedVideos.size === 0 || bulkDeleteVideosMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDeleteVideosMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {editMode && (
                    <th className="px-4 py-3 w-12"></th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Video ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Views
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {videos?.videos?.map((video) => (
                  <tr key={video.id} className={selectedVideos.has(video.id) ? 'bg-blue-50' : ''}>
                    {editMode && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedVideos.has(video.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedVideos)
                            if (e.target.checked) {
                              newSet.add(video.id)
                            } else {
                              newSet.delete(video.id)
                            }
                            setSelectedVideos(newSet)
                          }}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 font-mono text-sm">{video.video_id}</td>
                    <td className="px-6 py-4">{video.title || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{video.duration}s</td>
                    <td className="px-6 py-4">{video.view_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {videos && videos.total > 100 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => setVideoPage(1)}
                disabled={videoPage === 1}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &laquo;
              </button>
              <button
                onClick={() => setVideoPage((p) => Math.max(1, p - 1))}
                disabled={videoPage === 1}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &lsaquo;
              </button>

              {(() => {
                const totalPages = Math.ceil(videos.total / 100)
                const pages: (number | string)[] = []
                const showPages = 5

                if (totalPages <= showPages + 2) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i)
                } else {
                  pages.push(1)
                  const start = Math.max(2, videoPage - Math.floor(showPages / 2))
                  const end = Math.min(totalPages - 1, start + showPages - 1)
                  if (start > 2) pages.push('...')
                  for (let i = start; i <= end; i++) pages.push(i)
                  if (end < totalPages - 1) pages.push('...')
                  pages.push(totalPages)
                }

                return pages.map((page, idx) =>
                  typeof page === 'number' ? (
                    <button
                      key={idx}
                      onClick={() => {
                        setVideoPage(page)
                        setSelectedVideos(new Set())
                      }}
                      className={`px-3 py-1 rounded border ${
                        videoPage === page
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ) : (
                    <span key={idx} className="px-2 text-gray-400">
                      {page}
                    </span>
                  )
                )
              })()}

              <button
                onClick={() => setVideoPage((p) => Math.min(Math.ceil(videos.total / 100), p + 1))}
                disabled={!videos.has_more}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &rsaquo;
              </button>
              <button
                onClick={() => setVideoPage(Math.ceil(videos.total / 100))}
                disabled={!videos.has_more}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                &raquo;
              </button>

              <span className="ml-4 text-sm text-gray-500">
                Page {videoPage} of {Math.ceil(videos.total / 100)}
              </span>
            </div>
          )}
        </div>
      )}

      {effectiveTab === 'stats' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Statistics</h3>
            <button
              onClick={() => downloadEventsCSV(id!)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Export Events CSV
            </button>
          </div>

          {stats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-gray-500 text-sm">Total Sessions</div>
                  <div className="text-3xl font-bold">{stats.overview.total_sessions}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-gray-500 text-sm">Total Events</div>
                  <div className="text-3xl font-bold">{stats.overview.total_events}</div>
                </div>
              </div>

              <div className="mb-6">
                <CollapsibleCard title="Events by Type">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    {Object.entries(stats.event_counts).map(([type, count]) => (
                      <div key={type} className="text-center">
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-gray-500 text-xs">{type}</div>
                      </div>
                    ))}
                  </div>
                </CollapsibleCard>
              </div>

              <CollapsibleCard title="Group Comparison" bodyClassName="">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Group
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Algorithm
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        UI Config
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Users
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Sessions
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Events
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stats.group_stats.map((group) => (
                      <tr key={group.id}>
                        <td className="px-6 py-4 font-medium">{group.name}</td>
                        <td className="px-6 py-4 text-gray-500">
                          {formatAlgorithmConfig(group.algorithm_config)}
                        </td>
                        <td className="px-6 py-4 text-gray-500">{formatUIConfig(group.ui_config)}</td>
                        <td className="px-6 py-4">{group.user_count}</td>
                        <td className="px-6 py-4">{group.session_count}</td>
                        <td className="px-6 py-4">{group.event_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CollapsibleCard>

              {/* Recommendation Evaluation */}
              {evaluation && (
                <div className="mt-6">
                  <CollapsibleCard title="Recommendation Evaluation">

                  {/* Overall Metric Cards */}
                  <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold">{(evaluation.overall.ctr * 100).toFixed(1)}%</div>
                      <div className="text-gray-500 text-xs mt-1">CTR</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold">{formatSeconds(evaluation.overall.avg_watch_time_seconds as number)}</div>
                      <div className="text-gray-500 text-xs mt-1">Avg Watch Time</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold">{((evaluation.overall.watch_ratio_median as number) * 100).toFixed(0)}%</div>
                      <div className="text-gray-500 text-xs mt-1">Watch Ratio (median)</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold">{(evaluation.overall.session_length_median as number).toFixed(1)}</div>
                      <div className="text-gray-500 text-xs mt-1">Session Length (med videos)</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold">{formatSeconds(evaluation.overall.session_duration_median_seconds as number)}</div>
                      <div className="text-gray-500 text-xs mt-1">Session Duration (median)</div>
                    </div>
                  </div>

                  {/* Group Evaluation Table */}
                  {evaluation.groups.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Algorithm</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">CTR</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Watch Time</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ratio (med)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Length (med)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Duration (med)</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sessions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {evaluation.groups.map((group: Record<string, unknown>) => (
                            <tr key={group.group_id as string}>
                              <td className="px-4 py-3 font-medium text-sm">{group.group_name as string}</td>
                              <td className="px-4 py-3 text-gray-500 text-sm">
                                {formatAlgorithmConfig(group.algorithm_config as AlgorithmConfig)}
                              </td>
                              <td className={`px-4 py-3 text-right text-sm ${(group.sessions_evaluated as number) < 30 ? 'text-gray-400' : ''}`}>
                                {((group.ctr as number) * 100).toFixed(1)}%
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {formatSeconds(group.avg_watch_time_seconds as number)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {((group.watch_ratio_median as number) * 100).toFixed(0)}%
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {(group.session_length_median as number).toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {formatSeconds(group.session_duration_median_seconds as number)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-500">{group.sessions_evaluated as number}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {evaluation.overall.total_sessions_evaluated < 30 && (
                    <p className="text-xs text-yellow-600 mt-3">
                      Low confidence: fewer than 30 sessions evaluated.
                    </p>
                  )}
                  </CollapsibleCard>
                </div>
              )}

              {/* Per-user stats moved to Users tab → Status button on each row */}
            </>
          )}
        </div>
      )}

      {effectiveTab === 'surveys' && <SurveysTab experimentId={id!} />}

      {effectiveTab === 'recbole' && <RecBoleTab experimentId={id!} groups={recboleGroups} />}
    </div>
  )
}
