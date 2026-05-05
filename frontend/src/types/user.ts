import type { AlgorithmConfig, Device, UIConfig } from './experiment'

export interface User {
  id: number
  login_id: string
  is_admin: boolean
  user_group_id: number | null
  /** From the user's group; null for admins or unassigned users. */
  device: Device | null
  algorithm_config: AlgorithmConfig | null
  ui_config: UIConfig | null
}

export interface LoginRequest {
  login_id: string
  password: string
}

export interface LoginResponse {
  user: User
  message: string
}

export interface UserListItem {
  id: number
  login_id: string
  group_name: string | null
  is_admin: boolean
  is_active: boolean
  created_at: string
  last_login: string | null
}

export interface UsersListResponse {
  users: UserListItem[]
  total: number
}
