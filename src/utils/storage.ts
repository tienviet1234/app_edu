const STORAGE_KEY = 'lms:data:v5'

export const storage = {
  get: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  set: (value: string): void => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Storage full or denied — silent fail
    }
  },
}
