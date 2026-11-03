/**
 * Tìm buổi THIẾU của từng học sinh so với lịch học thực tế của cả lớp — để
 * admin phát hiện dữ liệu mất/lạc sớm (sự cố thật: Lớp 3/4/5 mất 17/10 ở
 * nhiều em, Lớp 10 cả lớp không có buổi nào sau 10/10 mà không ai biết).
 *
 * Ngày lớp có học =
 *  (1) ngày có đủ nhiều học sinh có buổi (≥ 30% sĩ số, tối thiểu 2 em), cộng
 *  (2) mọi ngày đúng THỨ học đều đặn của lớp (thứ xuất hiện ở ≥ 60% số tuần,
 *      tính từ tuần học đầu tiên tới hôm nay) — bắt được cả ngày CẢ LỚP không
 *      ai có buổi (ngày nghỉ lễ cũng sẽ hiện ra, admin tự bỏ qua).
 */

export interface MissingReport {
  /** Mọi ngày lớp được coi là có học (YYYY-MM-DD, tăng dần). */
  classDays: string[]
  /** Ngày đúng lịch học mà KHÔNG học sinh nào có buổi. */
  noOneDays: string[]
  /** Học sinh thiếu buổi (chỉ tính từ buổi đầu tiên của em đó). */
  byStudent: Array<{ studentId: string; missing: string[]; noSessions: boolean }>
}

const DAY = 86_400_000
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`)
const toDate = (t: number) => new Date(t).toISOString().slice(0, 10)
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay()
const weekIndex = (d: string) => Math.floor((toTime(d) - toTime('1970-01-05')) / (7 * DAY)) // tuần bắt đầu thứ 2

export function findMissingSessions(
  studentIds: string[],
  sessions: Array<{ studentId: string; date: string }>,
  today: string,
): MissingReport {
  const byDate = new Map<string, Set<string>>()
  for (const s of sessions) {
    if (s.date > today) continue
    byDate.set(s.date, (byDate.get(s.date) ?? new Set()).add(s.studentId))
  }
  const threshold = Math.max(2, Math.ceil(studentIds.length * 0.3))
  const observed = [...byDate.entries()].filter(([, set]) => set.size >= threshold).map(([d]) => d).sort()

  const expected: string[] = []
  if (observed.length) {
    const firstWeek = weekIndex(observed[0])
    const weeks = weekIndex(today) - firstWeek + 1
    if (weeks >= 2) {
      const weeksByDay = new Map<number, Set<number>>()
      for (const d of observed) weeksByDay.set(weekday(d), (weeksByDay.get(weekday(d)) ?? new Set()).add(weekIndex(d)))
      // Chỉ tính tuần đã qua trọn vẹn tới tuần có buổi cuối để đo độ đều đặn
      const spanWeeks = weekIndex(observed[observed.length - 1]) - firstWeek + 1
      const regular = new Set([...weeksByDay.entries()].filter(([, w]) => spanWeeks >= 2 && w.size >= Math.ceil(spanWeeks * 0.6)).map(([d]) => d))
      for (let t = toTime(observed[0]); t <= toTime(today); t += DAY) {
        const d = toDate(t)
        if (regular.has(weekday(d))) expected.push(d)
      }
    }
  }

  const classDays = [...new Set([...observed, ...expected])].sort()
  const noOneDays = expected.filter((d) => !byDate.has(d))
  const byStudent = studentIds.map((studentId) => {
    const mine = new Set(sessions.filter((s) => s.studentId === studentId).map((s) => s.date))
    if (!mine.size) return { studentId, missing: [], noSessions: true }
    const first = [...mine].sort()[0]
    return { studentId, missing: classDays.filter((d) => d >= first && !mine.has(d)), noSessions: false }
  }).filter((r) => r.noSessions || r.missing.length)
  return { classDays, noOneDays, byStudent }
}

export interface RecentMissingDay {
  date: string
  studentIds: string[]
  /** Đúng lịch học mà CẢ LỚP không có buổi nào (lớp nghỉ, hoặc chưa nhập). */
  wholeClass: boolean
}

/** Ngày thiếu buổi GẦN ĐÂY để cảnh báo admin ngay khi mở app, mới nhất trước.
 *  Bỏ hôm nay (lớp có thể chưa học/chưa nhập xong) và ngày admin đã ẩn (lớp nghỉ).
 *  Công cụ "Kiểm tra buổi thiếu" phải tự mở mới thấy — Lớp 7 thiếu 29/10 từ
 *  29/10 mà tới 03/11 mới có người biết. */
export function recentMissingDays(report: MissingReport, today: string, days = 14, dismissed: ReadonlySet<string> = new Set()): RecentMissingDay[] {
  const from = toDate(toTime(today) - days * DAY)
  const inRange = (d: string) => d >= from && d < today && !dismissed.has(d)
  const byDate = new Map<string, string[]>()
  for (const d of report.noOneDays) if (inRange(d)) byDate.set(d, [])
  for (const s of report.byStudent) {
    for (const d of s.missing) if (inRange(d)) byDate.set(d, [...(byDate.get(d) ?? []), s.studentId])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, studentIds]) => ({ date, studentIds, wholeClass: report.noOneDays.includes(date) }))
}
