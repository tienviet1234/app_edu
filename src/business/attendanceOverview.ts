// Màn "Điểm danh & Điểm — Toàn trung tâm" (đợt 2, 11/11). Thuần, có test. Dữ liệu là đúng bộ
// `GET /analytics/center-overview` của màn Học phí (buổi + điểm danh + tổng điểm đã chấm), máy
// tính ra bảng mỗi lớp 1 dòng × các ngày trong khoảng xem + danh sách "Cần xử lý".
import { findMissingSessions } from './missingSessions'

export type Attendance = 'present' | 'late' | 'excused' | 'absent' | null
export interface OverviewClass { id: string; name: string; teacherName: string; students: Array<{ id: string; name: string }> }
export interface OverviewSession { classId: string; studentId: string; date: string; attendance: Attendance; total: number | null }

/** Ô 1 lớp × 1 ngày. `full` đủ cả lớp · `partial` còn em chưa có buổi · `lonely` chỉ 1–2 em (học bù
 *  riêng hay nhập nhầm ngày?) · `missing` đúng lịch học mà chưa em nào có buổi. */
export type CellKind = 'full' | 'partial' | 'lonely' | 'missing'
export interface OverviewCell { kind: CellKind; count: number; roster: number; avg: number | null; studentNames: string[] }
export interface OverviewRow {
  classId: string; className: string; teacherName: string; roster: number
  cells: Record<string, OverviewCell>
  /** Có mặt + đi muộn / mọi buổi đã điểm danh trong khoảng (null = chưa có buổi nào). */
  attendRate: number | null
  /** Trung bình tổng điểm các buổi ĐÃ CHẤM (buổi chỉ điểm danh không tính là 0 — gradedTotal). */
  avgScore: number | null
  unexcused: number
}
export interface TodoItem { classId: string; className: string; kind: 'missing' | 'lonely'; dates: string[]; text: string }

export type RangeKey = 'week' | '14' | 'month'

const DAY = 864e5
const t = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
export const weekdayLabel = (d: string) => WD[new Date(t(d)).getUTCDay()]
export const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Các ngày của khoảng xem, tới HÔM NAY: tuần này (từ thứ 2), 14 ngày, tháng này. */
export function rangeDays(range: RangeKey, today: string): string[] {
  let from: number
  if (range === 'week') from = t(today) - (((new Date(t(today)).getUTCDay() + 6) % 7) * DAY)
  else if (range === 'month') from = t(`${today.slice(0, 8)}01`)
  else from = t(today) - 13 * DAY
  const out: string[] = []
  for (let x = from; x <= t(today); x += DAY) out.push(iso(x))
  return out
}

/** Ô "chỉ vài em": ≤ 2 em VÀ chưa tới nửa lớp (lớp 2 em đủ 2/2 vẫn là đủ lớp). */
export function cellKind(count: number, roster: number): Exclude<CellKind, 'missing'> {
  if (roster > 0 && count >= roster) return 'full'
  if (count <= 2 && count * 2 < roster) return 'lonely'
  return 'partial'
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function attendanceOverview(
  data: { classes: OverviewClass[]; sessions: OverviewSession[] },
  days: string[],
  today: string,
): { rows: OverviewRow[]; todos: TodoItem[]; todayClasses: Array<{ className: string; count: number; roster: number }> } {
  const inRange = new Set(days)
  const rows: OverviewRow[] = []
  const todos: TodoItem[] = []
  const todayClasses: Array<{ className: string; count: number; roster: number }> = []
  for (const c of data.classes) {
    const rosterIds = new Set(c.students.map((s) => s.id))
    const nameOf = new Map(c.students.map((s) => [s.id, s.name]))
    // Chỉ học sinh ĐANG trong lớp (em đã rời lớp có màn riêng ở Sức khỏe dữ liệu).
    const mine = data.sessions.filter((s) => s.classId === c.id && rosterIds.has(s.studentId))
    const report = findMissingSessions([...rosterIds], mine, today)
    const missingDays = report.noOneDays.filter((d) => inRange.has(d))
    const cells: Record<string, OverviewCell> = {}
    for (const d of days) {
      const ss = mine.filter((s) => s.date === d)
      if (ss.length) {
        const graded = ss.map((s) => s.total).filter((x): x is number => x != null)
        cells[d] = { kind: cellKind(new Set(ss.map((s) => s.studentId)).size, rosterIds.size), count: new Set(ss.map((s) => s.studentId)).size, roster: rosterIds.size, avg: mean(graded), studentNames: [...new Set(ss.map((s) => nameOf.get(s.studentId) ?? '?'))] }
      } else if (missingDays.includes(d)) {
        cells[d] = { kind: 'missing', count: 0, roster: rosterIds.size, avg: null, studentNames: [] }
      }
    }
    const win = mine.filter((s) => inRange.has(s.date))
    const marked = win.filter((s) => s.attendance)
    rows.push({
      classId: c.id, className: c.name, teacherName: c.teacherName, roster: rosterIds.size, cells,
      attendRate: marked.length ? Math.round((marked.filter((s) => s.attendance === 'present' || s.attendance === 'late').length / marked.length) * 100) : null,
      avgScore: mean(win.map((s) => s.total).filter((x): x is number => x != null)),
      unexcused: win.filter((s) => s.attendance === 'absent').length,
    })
    const dayList = (ds: string[]) => ds.map((d) => `${weekdayLabel(d)} ${dm(d)}`).join(', ')
    if (missingDays.length) {
      todos.push({ classId: c.id, className: c.name, kind: 'missing', dates: missingDays, text: `${dayList(missingDays)}: lớp có lịch nhưng chưa có buổi nào — lớp nghỉ hay chưa điểm danh?` })
    }
    for (const d of days) {
      const cell = cells[d]
      if (cell?.kind === 'lonely') todos.push({ classId: c.id, className: c.name, kind: 'lonely', dates: [d], text: `${weekdayLabel(d)} ${dm(d)}: chỉ ${cell.studentNames.join(', ')} có buổi (${cell.count}/${cell.roster} em) — học bù riêng hay nhập nhầm ngày?` })
    }
    if (report.classDays.includes(today) || mine.some((s) => s.date === today)) {
      todayClasses.push({ className: c.name, count: new Set(mine.filter((s) => s.date === today).map((s) => s.studentId)).size, roster: rosterIds.size })
    }
  }
  // Ngày gần nhất lên trước: việc mới phát sinh dễ xử lý nhất.
  todos.sort((a, b) => b.dates[b.dates.length - 1].localeCompare(a.dates[a.dates.length - 1]) || a.className.localeCompare(b.className, 'vi', { numeric: true }))
  rows.sort((a, b) => a.className.localeCompare(b.className, 'vi', { numeric: true }))
  return { rows, todos, todayClasses }
}
