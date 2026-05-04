import { useAuth } from '@/contexts/AuthContext'
import type { AlgorithmConfig, UIConfig } from '@/types'

export interface UseUserResult {
  login_id: string | undefined
  user_id: string | undefined
  user_group_id: string | null
  algorithm_config: AlgorithmConfig | null
  ui_config: UIConfig | null
  is_admin: boolean
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Read-only view of the current authenticated user.
 *
 * Login / logout flows stay on AuthContext — UI tracks consume state only.
 * IDs are surfaced as strings so callers don't need to know that the
 * frontend types declare them as `number` while the backend issues UUIDs.
 */
export function useUser(): UseUserResult {
  const { user, loading } = useAuth()

  return {
    login_id: user?.login_id,
    user_id: user?.id != null ? String(user.id) : undefined,
    user_group_id: user?.user_group_id != null ? String(user.user_group_id) : null,
    algorithm_config: user?.algorithm_config ?? null,
    ui_config: user?.ui_config ?? null,
    is_admin: !!user?.is_admin,
    isAuthenticated: !!user,
    isLoading: loading,
  }
}
