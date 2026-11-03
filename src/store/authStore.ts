import { create } from 'zustand'
import { api, refreshSession, setAccessToken } from '@/utils/api'
import { queryClient } from '@/lib/queryClient'
import { canKeepOfflineSession, classifyAuthFailure } from '@/business/authOffline'
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

// Tài khoản giáo viên/admin đăng nhập gần nhất trên máy này — để mở được app
// khi mất mạng. KHÔNG có token/mật khẩu: mọi lệnh gửi server vẫn phải xác thực.
const LAST_USER_KEY = 'lms:lastUser'

function rememberUser(user: AuthUser | null) {
  try {
    if (canKeepOfflineSession(user)) localStorage.setItem(LAST_USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(LAST_USER_KEY)
  } catch { /* bộ nhớ máy bị chặn — chỉ mất khả năng mở app lúc mất mạng */ }
}

function rememberedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY)
    const user = raw ? (JSON.parse(raw) as AuthUser) : null
    return user?.id && canKeepOfflineSession(user) ? user : null
  } catch {
    return null
  }
}

interface AuthStore {
  user: AuthUser | null
  isLoading: boolean
  isInitialized: boolean
  /** Đang dùng tài khoản nhớ trên máy, CHƯA xác thực lại được với server (mở
   *  app lúc mất mạng / server không trả lời). */
  sessionOffline: boolean
  error: string | null
  init: () => Promise<void>
  login: (creds: LoginCredentials) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<void>
  verifyOtp: (payload: VerifyOtpPayload) => Promise<void>
  resetPassword: (payload: ResetPasswordPayload) => Promise<void>
  updateProfile: (patch: { name?: string; phone?: string; avatar?: string }) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: false,
  isInitialized: false,
  sessionOffline: false,
  error: null,

  async init() {
    set({ isLoading: true })
    try {
      const payload = await refreshSession()
      rememberUser(payload.user)
      set({ user: payload.user, sessionOffline: false, isInitialized: true, isLoading: false })
    } catch (err) {
      setAccessToken(null)
      const kept = classifyAuthFailure(err) === 'unreachable' ? rememberedUser() : null
      if (classifyAuthFailure(err) === 'rejected') rememberUser(null)
      set({ user: kept, sessionOffline: !!kept, isInitialized: true, isLoading: false })
    }
  },

  async login(creds) {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post<ApiResponse<LoginResponse>>('/auth/login', creds)
      const payload = requireData(res.data)
      setAccessToken(payload.accessToken)
      queryClient.clear() // phòng khi tài khoản trước đó chưa kịp đăng xuất sạch cache
      rememberUser(payload.user)
      set({ user: payload.user, sessionOffline: false, isLoading: false })
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
      rememberUser(payloadData.user)
      set({ user: payloadData.user, sessionOffline: false, isLoading: false })
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
    rememberUser(null)
    set({ user: null, sessionOffline: false, error: null })
    // Xóa sạch cache React Query — không có full page reload khi đăng xuất,
    // nên nếu không dọn cache thủ công, tài khoản đăng nhập TIẾP THEO trên
    // cùng trình duyệt có thể thấy tạm thời dữ liệu cache của tài khoản cũ
    // (VD lớp đã bị xóa nhưng vẫn còn trong cache của phiên trước).
    queryClient.clear()
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
      rememberUser(useAuthStore.getState().user)
    }
  },

  async changePassword(currentPassword, newPassword) {
    await api.post('/auth/change-password', { currentPassword, newPassword })
  },

  clearError() {
    set({ error: null })
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    setAccessToken(null)
    rememberUser(null)
    useAuthStore.setState({ user: null, sessionOffline: false })
    queryClient.clear()
  })
  window.addEventListener('auth:refreshed', () => {
    if (useAuthStore.getState().sessionOffline) useAuthStore.setState({ sessionOffline: false })
  })

  // Mở app lúc mất mạng: có mạng lại thì xác thực lại ngay; mạng báo vẫn có mà
  // server chưa trả lời (đang khởi động) thì thử lại mỗi 30 giây. Server từ
  // chối thật mới về màn đăng nhập — dữ liệu trên máy vẫn còn, đăng nhập lại là thấy.
  const revalidate = () => {
    if (!useAuthStore.getState().sessionOffline) return
    refreshSession().catch((err) => {
      if (classifyAuthFailure(err) === 'rejected') window.dispatchEvent(new Event('auth:logout'))
    })
  }
  window.addEventListener('online', revalidate)
  setInterval(() => { if (navigator.onLine) revalidate() }, 30_000)
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
