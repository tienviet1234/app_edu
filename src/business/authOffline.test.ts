import { describe, it, expect } from 'vitest'
import { canKeepOfflineSession, classifyAuthFailure, shouldRefreshOn401 } from './authOffline'

describe('shouldRefreshOn401 (không gọi gia hạn hàng loạt sau khi đăng xuất)', () => {
  const live = { status: 401, sessionEnded: false }
  it('phiên còn sống, token hết hạn → gia hạn', () => {
    expect(shouldRefreshOn401(live)).toBe(true)
  })
  it('đã đăng xuất / server đã từ chối phiên → không gọi nữa', () => {
    expect(shouldRefreshOn401({ ...live, sessionEnded: true })).toBe(false)
  })
  it('không lặp: đã thử lại rồi, hoặc chính lệnh gia hạn bị 401', () => {
    expect(shouldRefreshOn401({ ...live, alreadyRetried: true })).toBe(false)
    expect(shouldRefreshOn401({ ...live, isRefreshRequest: true })).toBe(false)
  })
  it('lỗi khác 401 → không gia hạn', () => {
    for (const status of [400, 403, 409, 429, 500, undefined]) expect(shouldRefreshOn401({ ...live, status })).toBe(false)
  })
})

describe('classifyAuthFailure (mất mạng không được coi là đăng xuất)', () => {
  it('mất mạng / hết giờ (lỗi axios không có phản hồi) → giữ phiên', () => {
    expect(classifyAuthFailure({ isAxiosError: true })).toBe('unreachable')
    expect(classifyAuthFailure({ isAxiosError: true, code: 'ECONNABORTED' })).toBe('unreachable')
  })
  it('server đang khởi động / quá tải → giữ phiên', () => {
    for (const status of [500, 502, 503, 504, 408, 429]) expect(classifyAuthFailure({ isAxiosError: true, response: { status } })).toBe('unreachable')
  })
  it('server từ chối rõ ràng → đăng xuất thật', () => {
    for (const status of [400, 401, 403, 404]) expect(classifyAuthFailure({ isAxiosError: true, response: { status } })).toBe('rejected')
  })
  it('lỗi không phải từ mạng → không giữ phiên khi không chắc', () => {
    expect(classifyAuthFailure(new Error('dữ liệu sai'))).toBe('rejected')
    expect(classifyAuthFailure(null)).toBe('rejected')
    expect(classifyAuthFailure(undefined)).toBe('rejected')
  })
})

describe('canKeepOfflineSession', () => {
  it('chỉ giáo viên + admin', () => {
    expect(canKeepOfflineSession({ role: 'teacher' })).toBe(true)
    expect(canKeepOfflineSession({ role: 'admin' })).toBe(true)
    expect(canKeepOfflineSession({ role: 'student' })).toBe(false)
    expect(canKeepOfflineSession({ role: 'parent' })).toBe(false)
    expect(canKeepOfflineSession(null)).toBe(false)
  })
})
