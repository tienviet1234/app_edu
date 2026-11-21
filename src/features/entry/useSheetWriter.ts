import { useEffect, useRef, useState } from 'react'
import type { ClassData, Session } from '@/types'
import { markAttendance } from '@/business/quickAttendance'
import { sessionOnDate } from '@/business/gradeSheet'
import { toast } from '@/store/toastStore'
import { uid } from '@/utils/uid'
import { todayISO, viDate } from '@/utils/format'
import { pushByDate } from './useAttendanceWriter'

export type SheetRowStatus = { kind: 'saving' } | { kind: 'saved' } | { kind: 'offline' } | { kind: 'error'; msg: string }

type Result = { ok: true; changed: boolean } | { ok: false; reason: string }

/** Ghi Bảng chấm điểm (21/11): mỗi ô sửa KHO MÁY ngay (immer `update`, gắn cứng id lớp) rồi gom theo
 *  DÒNG (em + ngày) gửi qua `pushByDate` → `pushSession` (đường gửi duy nhất) sau ~0,6 giây ngừng sửa.
 *  Đang gửi mà sửa tiếp → gửi lại ngay khi xong (không gửi chồng). Rời trang / ẩn tab → gửi ngay phần
 *  đang chờ. CHỈ báo ✓ khi server xác nhận; lỗi thì nói rõ, điểm vẫn nằm trên máy. */
export function useSheetWriter(cls: ClassData, update: (fn: (c: ClassData) => void) => void, teacherName?: string) {
  const [status, setStatus] = useState<Record<string, SheetRowStatus>>({})
  const clsRef = useRef(cls)
  const updRef = useRef(update)
  useEffect(() => { clsRef.current = cls; updRef.current = update })
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; studentId: string; date: string }>())
  const running = useRef(new Set<string>())
  const again = useRef(new Set<string>())
  const key = (studentId: string, date: string) => `${studentId}|${date}`
  const set = (k: string, v: SheetRowStatus) => setStatus((x) => ({ ...x, [k]: v }))

  async function run(studentId: string, date: string) {
    const k = key(studentId, date)
    if (running.current.has(k)) { again.current.add(k); return }
    running.current.add(k)
    set(k, { kind: 'saving' })
    const name = clsRef.current.students.find((s) => s.id === studentId)?.name ?? ''
    try {
      let last: SheetRowStatus = { kind: 'saved' }
      do {
        again.current.delete(k)
        const out = await pushByDate(clsRef.current, studentId, date, updRef.current)
        switch (out.kind) {
          case 'saved': case 'alreadySynced': case 'nothing': last = { kind: 'saved' }; break
          case 'busy': last = { kind: 'error', msg: 'đang có lần gửi khác — sửa lại 1 ô để gửi tiếp' }; break
          case 'deleted':
            last = { kind: 'error', msg: 'buổi đã bị xóa trên server — đã giữ điểm trên máy' }
            toast.info(`Buổi ${viDate(date)} của ${name} đã bị xóa trên server — đã giữ điểm, sẽ tạo lại buổi khi gửi lần sau.`, { persist: true })
            break
          case 'conflict':
            last = { kind: 'error', msg: 'máy khác vừa lưu bản khác — mở "Chấm từng em" để chọn' }
            if (out.real) toast.error(`Buổi ${viDate(date)} của ${name} vừa được ${out.byName ?? 'người khác'} lưu bản khác ở máy khác — mở "Chấm từng em" để chọn giữ bản nào.`, { persist: true })
            break
          case 'error':
            if (out.offline) last = { kind: 'offline' }
            else {
              const msg = out.sameDateNo !== undefined ? 'em đã có buổi khác cùng ngày trên server' : out.message ?? 'lỗi, thử lại'
              last = { kind: 'error', msg }
              toast.error(`Không lưu được điểm ${name} ngày ${viDate(date)} — ${msg}. Điểm vẫn nằm trên máy.`, { persist: true })
            }
            break
        }
      } while (again.current.has(k))
      set(k, last)
    } finally {
      running.current.delete(k)
    }
  }

  function schedule(studentId: string, date: string, delay = 600) {
    const k = key(studentId, date)
    const prev = timers.current.get(k)
    if (prev) clearTimeout(prev.t)
    set(k, { kind: 'saving' })
    timers.current.set(k, { studentId, date, t: setTimeout(() => { timers.current.delete(k); void run(studentId, date) }, delay) })
  }

  function flushAll() {
    for (const [k, v] of timers.current) { clearTimeout(v.t); timers.current.delete(k); void run(v.studentId, v.date) }
  }

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flushAll)
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flushAll); flushAll() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Sửa buổi DUY NHẤT của em đó trong ngày (gọi `fn` trong immer). Không có / trùng ngày → từ chối. */
  function mutate(studentId: string, date: string, fn: (s: Session) => Result): Result {
    const res: { v: Result } = { v: { ok: false, reason: 'Không tìm thấy học sinh này trên máy — tải lại trang.' } }
    updRef.current((c) => {
      const st = c.students.find((s) => s.id === studentId)
      if (!st) return
      const on = sessionOnDate(st.sessions, date)
      if (on.kind === 'none') { res.v = { ok: false, reason: `${st.name} chưa có buổi ngày ${viDate(date)}.` }; return }
      if (on.kind === 'dup') { res.v = { ok: false, reason: `${st.name} có ${on.count} buổi cùng ngày — sửa ở "Sửa số buổi" trước.` }; return }
      res.v = fn(on.session)
    })
    if (res.v.ok && res.v.changed) schedule(studentId, date)
    return res.v
  }

  /** Tạo buổi (điểm danh "có mặt") cho em chưa có buổi ngày đó — tính học phí, màn gọi PHẢI hỏi lại. */
  async function create(studentId: string, date: string): Promise<boolean> {
    const res: { v: ReturnType<typeof markAttendance> | null } = { v: null }
    updRef.current((c) => { res.v = markAttendance(c.students, studentId, date, 'present', { newId: uid(), today: todayISO(), teacherName }) })
    const m = res.v
    if (!m || !m.ok) { toast.error(m && !m.ok ? m.reason : 'Không tạo được buổi — tải lại trang rồi thử lại.', { persist: true }); return false }
    await run(studentId, date)
    return true
  }

  return {
    mutate,
    create,
    status: (studentId: string, date: string): SheetRowStatus | undefined => status[key(studentId, date)],
    pending: () => timers.current.size + running.current.size,
  }
}
