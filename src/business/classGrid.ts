// Lưới cả lớp (đợt 2 C2, 11/11): học sinh × N buổi học gần nhất của lớp, ô = điểm danh + tổng điểm.
// Thuần, có test. Dữ liệu là đúng dữ liệu trên máy (như màn Nhập điểm) — buổi chưa lên server vẫn hiện.
import { findMissingSessions } from './missingSessions'
import type { AttendanceKey, Session } from '@/types'

export interface GridCell { sessionId: string; no: number; attendance: AttendanceKey; total: number | null; homework: string }
export interface GridRow { studentId: string; name: string; cells: Record<string, GridCell>; attended: number; avg: number | null }

/** `scoreOf` = tổng điểm buổi đó (null = chưa chấm / vắng có phép — KHÔNG tính là 0). */
export function classGrid(
  students: Array<{ id: string; name: string; sessions: Session[] }>,
  today: string,
  scoreOf: (s: Session) => number | null,
  n = 7,
): { days: string[]; dayCounts: Record<string, number>; rows: GridRow[] } {
  const all = students.flatMap((st) => st.sessions.filter((s) => s.date <= today).map((s) => ({ studentId: st.id, date: s.date })))
  const scheduled = findMissingSessions(students.map((s) => s.id), all, today).classDays
  // Ngày lớp có học (đúng lịch) + MỌI ngày có buổi (kể cả ngày chỉ 1 em — để thấy mà xem lại).
  const days = [...new Set([...scheduled, ...all.map((x) => x.date)])].sort().slice(-n)
  const dayCounts: Record<string, number> = {}
  for (const d of days) dayCounts[d] = new Set(all.filter((x) => x.date === d).map((x) => x.studentId)).size
  const rows = students.map((st) => {
    const cells: Record<string, GridCell> = {}
    for (const d of days) {
      const s = st.sessions.find((x) => x.date === d)
      if (s) cells[d] = { sessionId: s.id, no: s.no, attendance: s.entry.attendance, total: scoreOf(s), homework: s.homework ?? '' }
    }
    const vals = Object.values(cells)
    const graded = vals.map((c) => c.total).filter((x): x is number => x != null)
    return {
      studentId: st.id, name: st.name, cells,
      attended: vals.filter((c) => c.attendance === 'present' || c.attendance === 'late').length,
      avg: graded.length ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length) : null,
    }
  })
  return { days, dayCounts, rows }
}
