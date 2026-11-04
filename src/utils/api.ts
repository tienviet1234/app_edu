import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse, LoginResponse } from '@/types/auth'
import { classifyAuthFailure, shouldRefreshOn401 } from '@/business/authOffline'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 30_000,
})

let accessToken: string | null = null
let refreshPromise: Promise<LoginResponse> | null = null
let sessionEnded = false

export function setAccessToken(token: string | null) {
  accessToken = token
  if (token) sessionEnded = false
}

/** Phiên đã kết thúc thật (đăng xuất / server từ chối). Khác `setAccessToken(null)`
 *  lúc mở app khi mất mạng: khi đó phiên vẫn còn, có mạng lại phải gia hạn được.
 *  Xem shouldRefreshOn401. */
export function endSession() {
  accessToken = null
  sessionEnded = true
}

export function getAccessToken() {
  return accessToken
}

/** Gia hạn đăng nhập — MỌI nơi trong tab dùng chung 1 lần gọi: server chỉ cho
 *  dùng mỗi refresh token 1 lần, 2 lần gọi song song (lúc vừa có mạng lại) thì
 *  lần sau bị từ chối → văng ra màn đăng nhập. */
export function refreshSession(): Promise<LoginResponse> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<ApiResponse<LoginResponse>>('/auth/refresh')
      .then((r) => {
        const payload = r.data.data
        if (!r.data.success || !payload) throw new Error(r.data.message ?? 'Không gia hạn được đăng nhập.')
        setAccessToken(payload.accessToken)
        window.dispatchEvent(new Event('auth:refreshed'))
        return payload
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  // Server ghi kèm vào nhật ký / bản chụp — biết máy nào còn chạy bản cũ.
  config.headers['X-App-Version'] = __APP_VERSION__
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const isRefreshRequest = original.url?.includes('/auth/refresh')

    if (!shouldRefreshOn401({ status: error.response?.status, alreadyRetried: original._retry, isRefreshRequest, sessionEnded })) {
      return Promise.reject(error)
    }

    original._retry = true

    let newToken: string
    try {
      newToken = (await refreshSession()).accessToken
    } catch (refreshErr) {
      // Chỉ đăng xuất khi server từ chối thật. Rớt mạng đúng lúc gia hạn thì
      // giữ phiên — trước đây về màn đăng nhập, tưởng mất hết buổi vừa nhập.
      if (classifyAuthFailure(refreshErr) === 'rejected') {
        endSession()
        window.dispatchEvent(new Event('auth:logout'))
      }
      return Promise.reject(error)
    }

    original.headers.Authorization = `Bearer ${newToken}`
    return api(original)
  },
)
