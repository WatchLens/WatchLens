export type TrainingRunStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface TrainingRun {
  id: string
  experiment_id: string
  model_name: string
  top_k: number
  hyperparameters: Record<string, unknown>
  status: TrainingRunStatus
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  metrics: Record<string, number> | null
  interaction_count: number | null
  user_count: number | null
  item_count: number | null
  recommendation_count: number | null
  similarity_count: number | null
  duration_seconds: number | null
  created_at: string
  triggered_by: string | null
}

export interface TrainingRunCreateRequest {
  model_name: string
  top_k: number
  hyperparameters?: RecBoleHyperparameters
}

export interface TrainingRunListResponse {
  runs: TrainingRun[]
  total: number
}

export interface RecBoleStatus {
  installed: boolean
  version: string | null
  torch_version: string | null
  cuda_available: boolean
  device: string
  fit_period_minutes?: number
}

export interface RecBoleCoverage {
  users_with_recs: number
  total_users: number
  user_coverage_percent: number
  items_with_sims: number
  total_items: number
  item_coverage_percent: number
  cached_recommendations: number
  cached_similarities: number
  last_training_at: string | null
}

export interface RecBoleModelInfo {
  name: string
  category: string
  description: string
  default_hyperparameters: Record<string, unknown>
}

export interface RecBoleHyperparameters {
  epochs?: number
  learning_rate?: number
  train_batch_size?: number
  eval_batch_size?: number
  embedding_size?: number
  [key: string]: unknown
}
