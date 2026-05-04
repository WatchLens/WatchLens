import client from './client'
import type { User, LoginResponse } from '@/types'

export const login = async (loginId: string, password: string): Promise<LoginResponse> => {
  const response = await client.post<LoginResponse>('/auth/login', {
    login_id: loginId,
    password,
  })
  return response.data
}

export const logout = async (): Promise<{ message: string }> => {
  const response = await client.post<{ message: string }>('/auth/logout')
  return response.data
}

export const getCurrentUser = async (): Promise<User> => {
  const response = await client.get<User>('/auth/me')
  return response.data
}
