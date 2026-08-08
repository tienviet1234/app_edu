const BASE_KEY = 'lms:data:v5'

export function makeStorage(userId?: string) {
  const key = userId ? `${BASE_KEY}:${userId}` : BASE_KEY
  return {
    get: (): string | null => {
      try { return localStorage.getItem(key) } catch { return null }
    },
    set: (value: string): void => {
      try { localStorage.setItem(key, value) } catch {}
    },
  }
}

// Default (non-user-scoped) — kept for backward compat
export const storage = makeStorage()
