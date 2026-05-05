export type ExperimentStatus = 'draft' | 'active' | 'completed'

/**
 * Algorithm key — matches the registry key in the backend's
 * `app/recommenders/__init__.py` `RECOMMENDERS` dict. Validated server-
 * side at request time. The admin UI fetches the live list from
 * `GET /admin/recommenders` so this type intentionally stays open
 * (`string`) — adding a recommender is a backend-only change.
 */
export type AlgorithmKey = string

export interface AlgorithmConfig {
  feed: AlgorithmKey
  watch: AlgorithmKey
}

/**
 * Recommender metadata as returned by `GET /admin/recommenders`.
 * Mirrors the `RecommenderMeta` dataclass + capability flags.
 */
export interface RecommenderInfo {
  key: AlgorithmKey
  label: string
  category: 'baseline' | 'learned' | 'external' | string
  description: string
  supports_feed: boolean
  supports_watch: boolean
}

/**
 * UI key — matches either a built-in preset (`'youtube'`, `'tiktok'`),
 * the special `'none'` (feed only — disables the feed page and routes
 * straight into watch on first video), or a `ui_templates.id` UUID
 * pointing at an admin-authored template (visual or code track).
 *
 * Validated by the backend at request time.
 */
export type UIKey = string

/** Device class. Each user group is bound to one device (alembic 021). */
export type Device = 'desktop' | 'tablet' | 'mobile'

/**
 * Flat per-surface UI configuration. Each value is either a built-in
 * preset (desktop only) or a `ui_templates.id` UUID whose `device`
 * matches the owning group's device. Participants whose viewport
 * doesn't match the group's device see a mismatch notice rather than
 * a scaled-down UI — this preserves the per-device experimental
 * treatment.
 */
export interface UIConfig {
  feed: UIKey
  watch: UIKey
}

/**
 * UI preset metadata as surfaced by the admin dropdown. `devices` is
 * the set of device classes the preset was authored for; the admin
 * dropdown filters by the owning group's device class. Templates
 * always carry exactly one device (mirrors `ui_templates.device`);
 * built-ins can list multiple devices when the preset has no
 * device-specific UI (e.g. `'none'` redirects with no UI rendered).
 */
export interface UIPresetInfo {
  key: UIKey
  label: string
  kind: 'builtin' | 'template'
  description: string
  supports_feed: boolean
  supports_watch: boolean
  devices: Device[]
}

export interface UserGroup {
  id: number
  experiment_id: number
  name: string
  device: Device
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
  config: Record<string, unknown> | null
  created_at: string
  user_count: number
}

export interface UserGroupSummary {
  id: number
  name: string
  device: Device
  algorithm_config: AlgorithmConfig
  user_count: number
  config: Record<string, unknown> | null
}

export interface Experiment {
  id: number
  name: string
  description: string | null
  status: ExperimentStatus
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
  user_groups: UserGroupSummary[]
  total_users: number
  total_videos: number
}

export interface ExperimentsListResponse {
  experiments: Experiment[]
  total: number
}

export interface ExperimentCreateRequest {
  name: string
  description?: string
}

export interface ExperimentUpdateRequest {
  name?: string
  description?: string
  status?: ExperimentStatus
  start_date?: string | null
  end_date?: string | null
}

export interface UserGroupCreateRequest {
  name: string
  device: Device
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
  config?: Record<string, unknown>
}

export interface UserGroupUpdateRequest {
  name?: string
  device?: Device
  algorithm_config?: AlgorithmConfig
  ui_config?: UIConfig
  config?: Record<string, unknown>
}

export interface UserBulkCreateRequest {
  user_group_id: number | string
  count: number
  prefix: string
}

export interface UserCredential {
  login_id: string
  password: string
}

export interface UserBulkCreateResponse {
  created: number
  users: UserCredential[]
}

export interface VideoUploadResponse {
  created: number
  skipped: number
  errors: string[]
  total_errors: number
}
