import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse, LoginResponse } from '@/types/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
})

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const isRefreshRequest = original.url?.includes('/auth/refresh')

    if (error.response?.status !== 401 || original._retry || isRefreshRequest) {
      return Promise.reject(error)
    }

    original._retry = true

    if (!refreshPromise) {
      refreshPromise = api
        .post<ApiResponse<LoginResponse>>('/auth/refresh')
        .then((r) => {
          const token = r.data.data?.accessToken ?? null
          setAccessToken(token)
          return token
        })
        .catch(() => {
          setAccessToken(null)
          window.dispatchEvent(new Event('auth:logout'))
          return null
        })
        .finally(() => {
          refreshPromise = null
        })
    }

    const newToken = await refreshPromise
    if (!newToken) return Promise.reject(error)

    original.headers.Authorization = `Bearer ${newToken}`
    return api(original)
  },
)
