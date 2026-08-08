import { create } from 'zustand'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { storage } from '@/utils/storage'
import { seed, normalize } from '@/business/seed'

interface AppStore {
  data: AppData | null
  currentClassIndex: number
  activeTab: string
  saving: string
  _saveTimer: ReturnType<typeof setTimeout> | null

  init: () => void
  setData: (fn: (d: AppData) => void) => void
  setCurrentClass: (i: number) => void
  setTab: (tab: string) => void
  updateClass: (fn: (c: ClassData) => void) => void
  exportData: () => void
  importData: (file: File) => void
  resetData: () => void
}

const persist = (next: AppData, setState: (partial: Partial<AppStore>) => void) => {
  storage.set(JSON.stringify(next))
  setState({ saving: 'Đã lưu' })
  setTimeout(() => setState({ saving: '' }), 1200)
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: null,
  currentClassIndex: 0,
  activeTab: 'entry',
  saving: '',
  _saveTimer: null,

  init() {
    const raw = storage.get()
    try {
      const parsed = raw ? JSON.parse(raw) : null
      set({ data: parsed ? normalize(parsed) : seed() })
    } catch {
      set({ data: seed() })
    }
  },

  setData(fn) {
    const { data } = get()
    if (!data) return
    const next = produce(data, fn)
    set({ data: next })
    const timer = get()._saveTimer
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => persist(next, set), 400)
    set({ _saveTimer: t })
  },

  setCurrentClass(i) {
    set({ currentClassIndex: i })
  },

  setTab(tab) {
    set({ activeTab: tab })
  },

  updateClass(fn) {
    const { currentClassIndex, setData } = get()
    setData(
      produce((d) => {
        fn(d.classes[currentClassIndex])
      }),
    )
  },

  exportData() {
    const { data } = get()
    if (!data) return
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const today = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `sao-luu-hoc-tap-${today}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      alert('Không xuất được file. Bạn thử lại trên máy tính nhé.')
    }
  },

  importData(file) {
    const fr = new FileReader()
    fr.onload = () => {
      try {
        const j = normalize(JSON.parse(fr.result as string))
        if (!j.classes.length) throw new Error('empty')
        if (!confirm(`Nhập ${j.classes.length} lớp từ file sao lưu? Dữ liệu hiện tại sẽ được thay thế.`)) return
        set({ data: j, currentClassIndex: 0, saving: 'Đã nhập dữ liệu' })
        persist(j, set)
      } catch {
        alert('File sao lưu không hợp lệ.')
      }
    }
    fr.readAsText(file)
  },

  resetData() {
    const empty = { classes: [] }
    set({ data: empty, currentClassIndex: 0, activeTab: 'classes' })
    persist(empty, set)
  },
}))
