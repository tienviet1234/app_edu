import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  at: number
}

interface ToastStore {
  toasts: ToastItem[]
  history: ToastItem[]
  push: (message: string, opts?: { type?: ToastType; persist?: boolean }) => void
  dismiss: (id: string) => void
  clearHistory: () => void
}

const HISTORY_LIMIT = 30

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  history: [],

  push(message, opts) {
    const type = opts?.type ?? 'info'
    // Lỗi luôn được lưu lại để xem sau (giáo viên có thể đang bận, lướt qua
    // toast không kịp đọc) — hành động nhẹ chỉ lưu nếu chủ động yêu cầu.
    const persist = opts?.persist ?? type === 'error'
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const item: ToastItem = { id, message, type, at: Date.now() }

    set((s) => ({
      toasts: [...s.toasts, item],
      history: persist ? [item, ...s.history].slice(0, HISTORY_LIMIT) : s.history,
    }))

    const ttl = type === 'error' ? 6000 : 3000
    setTimeout(() => get().dismiss(id), ttl)
  },

  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  clearHistory() {
    set({ history: [] })
  },
}))

export const toast = {
  success: (message: string, opts?: { persist?: boolean }) =>
    useToastStore.getState().push(message, { type: 'success', persist: opts?.persist }),
  error: (message: string, opts?: { persist?: boolean }) =>
    useToastStore.getState().push(message, { type: 'error', persist: opts?.persist }),
  info: (message: string, opts?: { persist?: boolean }) =>
    useToastStore.getState().push(message, { type: 'info', persist: opts?.persist }),
}
