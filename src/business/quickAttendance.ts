// Điểm danh nhanh + đổi điểm danh trên lưới (đợt 3, 11/11). Thuần, có test. Chỉ sửa KHO MÁY (trong
// `update` của immer); gửi lên server luôn qua `pushSession` (đường gửi DUY NHẤT, services/sessionPush).
import type { AttendanceKey, Session } from '@/types'
import { emptyEntry } from './seed'
import { siblingDefaultsFor, nextNoOf } from './sync'
import { findMissingSessions } from './missingSessions'

type Stu = { id: string; name: string; sessions: Session[] }

/** Ngày cho chọn ở Điểm danh nhanh: n buổi học gần nhất của lớp (đúng lịch hoặc đã có buổi) tới hôm
 *  nay, cộng HÔM NAY nếu chưa có trong đó (`scheduled: false` = hôm nay không đúng lịch → hỏi lại). */
export function attendanceDayOptions(students: Stu[], today: string, n = 3): Array<{ date: string; scheduled: boolean }> {
  const all = students.flatMap((st) => st.sessions.filter((s) => s.date <= today).map((s) => ({ studentId: st.id, date: s.date })))
  const scheduled = new Set(findMissingSessions(students.map((s) => s.id), all, today).classDays)
  const days = [...new Set([...scheduled, ...all.map((x) => x.date)])].filter((d) => d <= today).sort().slice(-n)
  const out = days.map((date) => ({ date, scheduled: true }))
  if (!days.includes(today)) out.push({ date: today, scheduled: scheduled.has(today) })
  return out
}

/** Ghi điểm danh 1 em cho 1 NGÀY: có buổi ngày đó → đổi điểm danh; chưa có → tạo buổi mới ngày đó
 *  (bài tập + số câu theo bạn CÙNG NGÀY — `siblingDefaultsFor`; số buổi tạm n+1, server xếp lại theo
 *  ngày khi gửi). Luôn đánh dấu `dirty` (chờ server xác nhận). Từ chối: ngày tương lai, em có 2 buổi
 *  cùng ngày (không biết sửa buổi nào — trùng ngày làm học phí đếm dư). */
export function markAttendance(
  students: Stu[], studentId: string, date: string, attendance: AttendanceKey,
  opts: { newId: string; today: string; teacherName?: string; nowIso?: string },
): { ok: true; sessionId: string; created: boolean; changed: boolean } | { ok: false; reason: string } {
  const st = students.find((s) => s.id === studentId)
  if (!st) return { ok: false, reason: 'Không tìm thấy học sinh này trên máy.' }
  if (date > opts.today) return { ok: false, reason: 'Không điểm danh trước cho ngày chưa tới.' }
  const same = st.sessions.filter((s) => s.date === date)
  if (same.length > 1) return { ok: false, reason: `${st.name} đang có ${same.length} buổi cùng ngày này — sửa ở "Sửa số buổi" trước (trùng ngày làm học phí đếm dư).` }
  if (same.length === 1) {
    const s = same[0]
    const changed = s.entry.attendance !== attendance
    if (changed) { s.entry = { ...s.entry, attendance }; s.dirty = true }
    return { ok: true, sessionId: s.id, created: false, changed }
  }
  const inherited = siblingDefaultsFor(students, date)
  const session: Session = {
    id: opts.newId, no: nextNoOf(st.sessions.map((s) => s.no)), date, homework: inherited.homework,
    entry: { ...emptyEntry(), attendance }, createdByName: opts.teacherName, recordedAt: opts.nowIso ?? new Date().toISOString(),
    maxes: inherited.maxes, dirty: true,
  }
  st.sessions.push(session)
  st.sessions.sort((a, b) => a.no - b.no)
  return { ok: true, sessionId: session.id, created: true, changed: true }
}

/** Đếm điểm danh 1 ngày + ai CHƯA có buổi (cho nút "Cả lớp có mặt" — chỉ ghi các em này). */
export function dayAttendanceStats(students: Stu[], date: string) {
  const c = { present: 0, late: 0, excused: 0, absent: 0 }
  const unmarked: string[] = []
  for (const st of students) {
    const s = st.sessions.find((x) => x.date === date)
    if (s) c[s.entry.attendance] += 1
    else unmarked.push(st.id)
  }
  return { ...c, unmarked }
}
