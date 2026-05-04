import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const client: AxiosInstance = axios.create({
  baseURL: `${API_URL}/v1`,
  withCredentials: true, // Send cookies with requests
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor for error handling
client.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      const reqUrl = error.config?.url || ''
      const path = window.location.pathname
      // /auth/me is expected to 401 when logged out; AuthContext handles it.
      // /login itself obviously doesn't need redirecting to itself.
      const selfHandled =
        reqUrl.includes('/auth/me') ||
        path === '/login'
      if (!selfHandled) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
