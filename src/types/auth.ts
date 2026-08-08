export type UserRole = 'admin' | 'teacher' | 'student' | 'parent'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
}

export interface AuthTokens {
  accessToken: string
  expiresAt: number
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  role: UserRole
  inviteCode?: string
}

export interface ForgotPasswordPayload {
  email: string
}

export interface VerifyOtpPayload {
  email: string
  otp: string
}

export interface ResetPasswordPayload {
  email: string
  otp: string
  newPassword: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  errors?: Record<string, string>
}

export interface LoginResponse {
  user: AuthUser
  accessToken: string
  expiresIn: number
}

export const ROLE_RANK: Record<UserRole, number> = {
  admin: 4,
  teacher: 3,
  student: 2,
  parent: 1,
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Quản trị viên',
  teacher: 'Giáo viên',
  student: 'Học sinh',
  parent: 'Phụ huynh',
}
