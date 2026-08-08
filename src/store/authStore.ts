import { create } from 'zustand'
import { api, setAccessToken } from '@/utils/api'
import type {
  ApiResponse,
  AuthUser,
  ForgotPasswordPayload,
  LoginCredentials,
  LoginResponse,
  RegisterPayload,
  ResetPasswordPayload,
  VerifyOtpPayload,
} from '@/types/auth'

interface AuthStore {
  user: AuthUser | null
  isLoading: boolean
  isInitialized: boolean
  error: string | null
  init: () => Promise<void>
  login: (creds: LoginCredentials) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>
  verifyOtp: (payload: VerifyOtpPayload) => Promise<void>
  resetPassword: (payload: ResetPasswordPayload) => Promise<void>
  updateProfile: (patch: { name?: string; phone?: string; avatar?: string }) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  async init() {
    set({ isLoading: true })
    try {
      const res = await api.post<ApiResponse<LoginResponse>>('/auth/refresh')
      const payload = requireData(res.data)
      setAccessToken(payload.accessToken)
      set({ user: payload.user, isInitialized: true, isLoading: false })
    } catch {
      setAccessToken(null)
      set({ user: null, isInitialized: true, isLoading: false })
    }
  },

  async login(creds) {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', creds)
      const payload = requireData(res.data)
      setAccessToken(payload.accessToken)
      set({ user: payload.user, isLoading: false })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  async register(payload) {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post<ApiResponse<LoginResponse>>('/auth/register', payload)
      const payloadData = requireData(res.data)
      setAccessToken(payloadData.accessToken)
      set({ user: payloadData.user, isLoading: false })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  async logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // Best effort logout.
    }
    setAccessToken(null)
    set({ user: null, error: null })
  },

  async forgotPassword(payload) {
    set({ isLoading: true, error: null })
    try {
      await api.post('/auth/forgot-password', payload)
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  async verifyOtp(payload) {
    set({ isLoading: true, error: null })
    try {
      await api.post('/auth/verify-otp', payload)
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  async resetPassword(payload) {
    set({ isLoading: true, error: null })
    try {
      await api.post('/auth/reset-password', payload)
      set({ isLoading: false })
    } catch (err: unknown) {
      const msg = extractErrorMessage(err)
      set({ error: msg, isLoading: false })
      throw new Error(msg)
    }
  },

  async updateProfile(patch) {
    const res = await api.patch<ApiResponse<AuthUser>>('/auth/me', patch)
    if (res.data.success && res.data.data) {
      set((s) => ({ user: s.user ? { ...s.user, ...res.data.data } : s.user }))
    }
  },

  clearError() {
    set({ error: null })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    setAccessToken(null)
    useAuthStore.setState({ user: null })
  })
}

function requireData<T>(res: ApiResponse<T>): T {
  if (!res.success || !res.data) {
    throw new Error(res.message ?? 'Đã xảy ra lỗi, thử lại sau.')
  }
  return res.data
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    return axiosErr.response?.data?.message ?? 'Đã xảy ra lỗi, thử lại sau.'
  }
  if (err instanceof Error) return err.message
  return 'Đã xảy ra lỗi, thử lại sau.'
}
