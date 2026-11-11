import { useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
import { getClassRubric } from '@/constants/rubrics'
import { markAttendance } from '@/business/quickAttendance'
import { useActionLock } from '@/hooks/useActionLock'
import { pushSession, type PushOutcome } from '@/services/sessionPush'
import { useAppStore } from '@/store/appStore'
import { toast } from '@/store/toastStore'
import { uid } from '@/utils/uid'
import { todayISO, viDate } from '@/utils/format'

export type RowStatus = 'saving' | 'saved' | 'offline' | 'error'

/** Ghi điểm danh 1 em / 1 ngày từ Điểm danh nhanh + lưới cả lớp (đợt 3, 11/11):
 *  khóa theo em (bấm dồn không gửi chồng) → sửa kho máy (`markAttendance`) → gửi NGAY qua
 *  `pushSession` (đường gửi duy nhất) → chỉ báo đã lưu khi server xác nhận. Đang có lần gửi khác
 *  cho đúng buổi đó (tự lưu nền) → chờ rồi gửi lại (tối đa ~10 giây); phần sửa vẫn nằm trên máy. */
export function useAttendanceWriter(cls: ClassData, update: (fn: (c: ClassData) => void) => void, teacherName?: string) {
  const lock = useActionLock()
  const [status, setStatus] = useState<Record<string, RowStatus>>({})
  const set = (k: string, v: RowStatus) => setStatus((x) => ({ ...x, [k]: v }))

  async function push(studentId: string, date: string): Promise<PushOutcome> {
    let out: PushOutcome = { kind: 'busy' }
    for (let i = 0; i < 10 && out.kind === 'busy'; i++) {
      // Tìm buổi THEO NGÀY trong kho máy ngay lúc gửi (mỗi em 1 buổi/ngày — markAttendance đã chặn
      // trùng): lần gửi khác có thể vừa đổi id tạm → id server.
      const fresh = useAppStore.getState().data?.classes.find((c) => c.id === cls.id)?.students.find((s) => s.id === studentId)
      const sid = fresh?.sessions.find((s) => s.date === date)?.id
      if (!sid) return { kind: 'nothing' }
      out = await pushSession({ cls, rubric: getClassRubric(cls), studentId, sessionLocalId: sid, update })
      if (out.kind === 'busy') await new Promise((r) => setTimeout(r, 1000))
    }
    return out
  }

  /** Trả true khi server ĐÃ xác nhận (hoặc không có gì để gửi). */
  async function mark(studentId: string, date: string, attendance: AttendanceKey): Promise<boolean> {
    const key = `${studentId}|${date}`
    const r = await lock.run(key, async () => {
      const name = cls.students.find((s) => s.id === studentId)?.name ?? ''
      const res = { v: null as ReturnType<typeof markAttendance> | null }
      update((c) => { res.v = markAttendance(c.students, studentId, date, attendance, { newId: uid(), today: todayISO(), teacherName }) })
      const m = res.v
      if (!m || !m.ok) { toast.error(m && !m.ok ? m.reason : 'Không ghi được — tải lại trang rồi thử lại.', { persist: true }); return false }
      set(key, 'saving')
      const out = await push(studentId, date)
      switch (out.kind) {
        case 'saved': case 'alreadySynced': case 'nothing': set(key, 'saved'); return true
        case 'busy': set(key, 'error'); toast.error(`Đang gửi điểm của ${name} — chưa xong, bấm lại sau giây lát (điểm danh vẫn nằm trên máy).`); return false
        case 'deleted': set(key, 'error'); toast.info(`Buổi ${viDate(date)} của ${name} đã bị xóa trên server — đã giữ điểm danh, sẽ tạo lại buổi khi gửi lần sau.`, { persist: true }); return false
        case 'conflict': set(key, 'error'); if (out.real) toast.error(`Buổi ${viDate(date)} của ${name} vừa được ${out.byName ?? 'người khác'} lưu bản khác ở máy khác — mở "Chấm từng em" để chọn giữ bản nào.`, { persist: true }); return false
        case 'error':
          if (out.offline) { set(key, 'offline'); toast.info(`Điểm danh ${name} đã lưu trên máy — sẽ tự gửi lên khi có mạng.`); return false }
          set(key, 'error')
          toast.error(`Không lưu được điểm danh ${name} ngày ${viDate(date)} — ${out.sameDateNo !== undefined ? `em đã có buổi khác cùng ngày trên server` : out.message ?? 'thử lại'}.`, { persist: true })
          return false
      }
    })
    return !r.skipped && r.value
  }

  return { mark, status: (studentId: string, date: string) => status[`${studentId}|${date}`], isBusy: (studentId: string, date: string) => lock.isBusy(`${studentId}|${date}`) }
}
