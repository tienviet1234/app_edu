import { create } from 'zustand'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { makeStorage, storageKeyFor } from '@/utils/storage'
import { seed, normalize } from '@/business/seed'
import { toast } from '@/store/toastStore'
import { rescueOtherTabSessions } from '@/business/sync'
import { backupBeforeReplace } from '@/utils/localBackup'

interface AppStore {
  data: AppData | null
  currentClassIndex: number
  activeTab: string
  saving: string
  userId: string | undefined
  _saveTimer: ReturnType<typeof setTimeout> | null

  init: (userId?: string) => void
  setData: (fn: (d: AppData) => void) => void
  setCurrentClass: (i: number) => void
  setTab: (tab: string) => void
  updateClass: (fn: (c: ClassData) => void) => void
  /** Like updateClass but targets a FIXED class id — safe for async work that
   *  finishes after the user has switched to another class. */
  updateClassById: (classId: string, fn: (c: ClassData) => void) => void
  /** Ghi NGAY phần đang chờ (debounce 400ms) — gọi khi rời trang. */
  flushPersist: () => void
  exportData: () => void
  importData: (file: File) => void
  resetData: () => void
}

let warnedStorageFull = false

// Bản dữ liệu tab NÀY đọc/ghi xuống máy lần cuối — để biết lúc ghi có tab
// khác đã ghi chen vào không (xem rescueOtherTabSessions).
let lastKnownRaw: string | null = null

const parseRaw = (raw: string | null): AppData | null => {
  if (!raw) return null
  try { return normalize(JSON.parse(raw)) } catch { return null }
}

/** `replace` = nhập file sao lưu / xóa hết dữ liệu: cố ý thay toàn bộ, không gộp. */
const persist = (next: AppData, userId: string | undefined, setState: (partial: Partial<AppStore>) => void, replace = false) => {
  if (!replace) {
    // Tab khác đã ghi xuống máy kể từ lần cuối tab này đọc/ghi → giữ lại các
    // buổi CHƯA lên server tab kia vừa tạo, rồi mới ghi. Trước đây tab cũ ghi
    // đè thẳng — nghi là đường mất điểm 17–18/10 Lớp 3/4/5 cô Trà.
    const storedRaw = makeStorage(userId).get()
    if (storedRaw && storedRaw !== lastKnownRaw) {
      const stored = parseRaw(storedRaw)
      if (stored) {
        let result = { kept: 0, conflicts: 0 }
        const merged = produce(next, (d) => { result = rescueOtherTabSessions(d, stored, parseRaw(lastKnownRaw)) })
        if (result.kept) {
          next = merged
          setState({ data: merged })
          toast.info(`App đang mở ở 2 tab trên máy này — đã giữ lại ${result.kept} buổi do tab kia vừa nhập/sửa. Nên đóng bớt 1 tab.`, { persist: true })
        }
        if (result.conflicts) {
          toast.error(`App đang mở ở 2 tab và CẢ 2 cùng sửa ${result.conflicts} buổi — đang giữ bản của tab này. Đóng bớt 1 tab rồi kiểm tra lại các buổi vừa sửa.`, { persist: true })
        }
      }
    }
  }
  const raw = JSON.stringify(next)
  const ok = makeStorage(userId).set(raw)
  if (ok) lastKnownRaw = raw
  if (!ok) {
    // Không ghi được vào máy — dữ liệu chỉ còn trong tab đang mở (đóng tab /
    // F5 là mất phần chưa lên server). Báo rõ thay vì "Đã lưu" như trước.
    setState({ saving: 'Lỗi lưu trên máy' })
    if (!warnedStorageFull) {
      warnedStorageFull = true
      toast.error('Trình duyệt không cho lưu dữ liệu trên máy (bộ nhớ đầy hoặc đang ở chế độ ẩn danh). Điểm vẫn được gửi lên server, nhưng đừng đóng tab khi chưa thấy lưu xong.', { persist: true })
    }
    return
  }
  setState({ saving: 'Đã lưu' })
  setTimeout(() => setState({ saving: '' }), 1200)
}

// Nhớ ĐÚNG lớp đang xem qua mỗi lần F5 — trước đây currentClassIndex luôn
// reset về 0 (lớp đầu tiên) sau khi tải lại trang, dù đang xem lớp khác.
// Lưu theo classId (không phải index) để không bị lệch nếu thứ tự lớp
// thay đổi (thêm/xóa lớp khác).
const lastClassKey = (userId?: string) => `lms:lastClass${userId ? `:${userId}` : ''}`

const getLastClassId = (userId?: string): string | null => {
  try { return localStorage.getItem(lastClassKey(userId)) } catch { return null }
}

const setLastClassId = (userId: string | undefined, classId: string) => {
  try { localStorage.setItem(lastClassKey(userId), classId) } catch {}
}

// Nhớ ĐÚNG tab đang xem qua mỗi lần F5 — trước đây activeTab luôn reset về
// 'entry' (Nhập điểm) sau khi tải lại trang, dù đang ở tab khác (VD đang
// chấm dở bằng AI, F5 xong bị nhảy sang Nhập điểm, tưởng lạc trang).
const lastTabKey = (userId?: string) => `lms:lastTab${userId ? `:${userId}` : ''}`

const getLastTab = (userId?: string): string | null => {
  try { return localStorage.getItem(lastTabKey(userId)) } catch { return null }
}

const setLastTab = (userId: string | undefined, tab: string) => {
  try { localStorage.setItem(lastTabKey(userId), tab) } catch {}
}

export const useAppStore = create<AppStore>((set, get) => ({
  data: null,
  currentClassIndex: 0,
  activeTab: 'entry',
  saving: '',
  userId: undefined,
  _saveTimer: null,

  init(userId) {
    const raw = makeStorage(userId).get()
    lastKnownRaw = raw
    try {
      const parsed = raw ? JSON.parse(raw) : null
      const data = parsed ? normalize(parsed) : seed()
      const lastId = getLastClassId(userId)
      const idx = lastId ? data.classes.findIndex((c) => c.id === lastId) : -1
      const lastTab = getLastTab(userId)
      set({ data, userId, currentClassIndex: idx >= 0 ? idx : 0, activeTab: lastTab || 'entry' })
    } catch {
      set({ data: seed(), userId, currentClassIndex: 0 })
    }
  },

  setData(fn) {
    const { data, userId } = get()
    if (!data) return
    const next = produce(data, fn)
    if (next === data) return // không đổi gì — khỏi ghi lại
    set({ data: next })
    const timer = get()._saveTimer
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => { set({ _saveTimer: null }); persist(next, userId, set) }, 400)
    set({ _saveTimer: t })
  },

  setCurrentClass(i) {
    const { data, userId } = get()
    const classId = data?.classes[i]?.id
    if (classId) setLastClassId(userId, classId)
    set({ currentClassIndex: i })
  },

  setTab(tab) {
    set({ activeTab: tab })
    setLastTab(get().userId, tab)
  },

  updateClass(fn) {
    const { currentClassIndex, setData } = get()
    setData(
      produce((d) => {
        fn(d.classes[currentClassIndex])
      }),
    )
  },

  flushPersist() {
    const { _saveTimer, data, userId } = get()
    if (!_saveTimer || !data) return
    clearTimeout(_saveTimer)
    set({ _saveTimer: null })
    persist(data, userId, set)
  },

  updateClassById(classId: string, fn: (c: ClassData) => void) {
    get().setData(
      produce((d: AppData) => {
        const c = d.classes.find((x) => x.id === classId)
        if (c) fn(c)
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
        if (!confirm(`Nhập ${j.classes.length} lớp từ file sao lưu? Dữ liệu hiện tại sẽ được thay thế (máy giữ lại 1 bản sao lưu trước khi thay — xem "🛟 Bản sao lưu trên máy").`)) return
        const { userId } = get()
        backupBeforeReplace(userId, 'trước khi nhập file')
        set({ data: j, currentClassIndex: 0, saving: 'Đã nhập dữ liệu' })
        persist(j, userId, set, true)
      } catch {
        alert('File sao lưu không hợp lệ.')
      }
    }
    fr.readAsText(file)
  },

  resetData() {
    const { userId } = get()
    // Trước đây xóa là mất hẳn, kể cả phần chưa lên server.
    backupBeforeReplace(userId, 'trước khi xóa toàn bộ')
    const empty = { classes: [] }
    set({ data: empty, currentClassIndex: 0, activeTab: 'classes' })
    setLastTab(userId, 'classes')
    persist(empty, userId, set, true)
  },
}))

if (typeof window !== 'undefined') {
  // Rời trang/đóng tab trong 400ms sau lần sửa cuối: trước đây lần sửa đó
  // KHÔNG vào bộ nhớ máy (chỉ hẹn giờ ghi), mở lại là mất phần chưa lên server.
  const flush = () => useAppStore.getState().flushPersist()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })

  // App mở ở 2 tab cùng máy: mỗi tab giữ 1 bản trong bộ nhớ và ghi CẢ bản
  // xuống máy → tab cũ ghi đè mất phần tab kia vừa sửa. Giờ tab nào cũng nhận
  // bản tab kia vừa ghi (khi chính nó không có gì đang chờ ghi); đang có phần
  // chờ ghi thì lúc ghi `persist` tự gộp lại buổi chưa lên server của tab kia.
  window.addEventListener('storage', (e) => {
    const { userId, _saveTimer, data, currentClassIndex } = useAppStore.getState()
    if (e.key !== storageKeyFor(userId) || !e.newValue) return
    if (_saveTimer) return
    try {
      const next = normalize(JSON.parse(e.newValue))
      const currentId = data?.classes[currentClassIndex]?.id
      const idx = currentId ? next.classes.findIndex((c) => c.id === currentId) : -1
      lastKnownRaw = e.newValue
      useAppStore.setState({ data: next, currentClassIndex: idx >= 0 ? idx : 0 })
    } catch {
      // bản tab kia ghi bị hỏng — giữ nguyên bản đang có
    }
  })
}
