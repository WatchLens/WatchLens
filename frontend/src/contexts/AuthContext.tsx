import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { getCurrentUser, login as apiLogin, logout as apiLogout } from '@/api/auth'
import type { User, LoginResponse } from '@/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (loginId: string, password: string) => Promise<LoginResponse>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const checkAuth = useCallback(async (): Promise<void> => {
    try {
      const userData = await getCurrentUser()
      setUser(userData)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Check if user is logged in on mount
    checkAuth()
  }, [checkAuth])

  const login = async (loginId: string, password: string): Promise<LoginResponse> => {
    // Clear any stale session-scoped state from a previous user in the same
    // tab. Without this, event batches get posted with a foreign session_id
    // (→ 403) until the tab is closed.
    sessionStorage.removeItem('session_id')
    sessionStorage.removeItem('session_user_id')
    const response = await apiLogin(loginId, password)
    setUser(response.user)
    return response
  }

  const logout = async (): Promise<void> => {
    try {
      await apiLogout()
    } catch {
      // Swallow network/500 — local cleanup must still run so the user isn't
      // stuck with a phantom session.
    } finally {
      setUser(null)
      sessionStorage.removeItem('session_id')
      sessionStorage.removeItem('session_user_id')
      }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
