import type { AlgorithmConfig, UIConfig } from './experiment'

export interface StatsOverview {
  total_videos: number
  total_groups: number
  total_users: number
  total_sessions: number
  total_events: number
  avg_watch_ratio: number | null
}

export interface EventCounts {
  VIDEO_START: number
  VIDEO_END: number
  LIKE: number
  DISLIKE: number
  FEED_CLICK: number
  IMPRESSION: number
}

export interface GroupStats {
  id: number
  name: string
  user_count: number
  session_count: number
  event_count: number
  avg_watch_ratio: number | null
  algorithm_config: AlgorithmConfig
  ui_config: UIConfig
}

export interface StatsResponse {
  overview: StatsOverview
  event_counts: EventCounts
  group_stats: GroupStats[]
}
