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
 * Validated by the backend at request time. The admin UI fetches the
 * available list from `GET /admin/ui-presets` (built-ins) and
 * `GET /admin/ui-templates?status=published` (templates) — same pattern
 * as the recommender registry.
 */
export type UIKey = string

export interface UIConfig {
  feed: UIKey   // built-in key, template UUID, or 'none'
  watch: UIKey  // built-in key or template UUID
}

/**
 * UI preset metadata as surfaced by the admin dropdown.
 * `kind` distinguishes hardcoded built-ins from DB-registered templates.
 */
export interface UIPresetInfo {
  key: UIKey
  label: string
  kind: 'builtin' | 'template'
  description: string
  supports_feed: boolean
  supports_watch: boolean
}

export interface UserGroup {
  id: number
  experiment_id: number
  name: string
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
  config: Record<string, unknown> | null
  created_at: string
  user_count: number
}

export interface UserGroupSummary {
  id: number
  name: string
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
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
  config?: Record<string, unknown>
}

export interface UserGroupUpdateRequest {
  name?: string
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
