const BASE_KEY = 'lms:data:v5'

export const storageKeyFor = (userId?: string) => (userId ? `${BASE_KEY}:${userId}` : BASE_KEY)

export function makeStorage(userId?: string) {
  const key = storageKeyFor(userId)
  return {
    get: (): string | null => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    /** false = KHÔNG ghi được (bộ nhớ trình duyệt đầy / chế độ ẩn danh chặn) —
     *  trước đây lỗi bị nuốt im lặng mà app vẫn báo "Đã lưu". */
    set: (value: string): boolean => {
      try { localStorage.setItem(key, value); return true } catch { return false }
    },
  }
}

// Default (non-user-scoped) — kept for backward compat
export const storage = makeStorage()
