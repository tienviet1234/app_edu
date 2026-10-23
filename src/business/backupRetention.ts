/** Bản sao lưu nào được XÓA khi dọn (dùng cho bản sao lưu nằm ngay trên máy —
 *  utils/localBackup.ts; server dùng cùng quy tắc ở server/src/utils/
 *  snapshotRetention.ts). GIỮ:
 *   - 60 bản mới nhất;
 *   - trong 3 ngày gần nhất: bản mới nhất của MỖI GIỜ;
 *   - trong 30 ngày gần nhất: bản mới nhất của MỖI NGÀY (giờ VN).
 *  Ngoài ra mới xóa. Tối đa ~60 + 72 + 30 bản. */
export const KEEP_RECENT = 60
const HOUR = 3600e3
const DAY = 24 * HOUR
const HOURLY_FOR = 3 * DAY
const DAILY_FOR = 30 * DAY

export function backupsToDelete<T extends { at: number }>(items: T[], now: number = Date.now()): T[] {
  const sorted = [...items].sort((a, b) => b.at - a.at)
  const hours = new Set<number>()
  const days = new Set<number>()
  const out: T[] = []
  sorted.forEach((s, i) => {
    const hour = Math.floor(s.at / HOUR)
    const day = Math.floor((s.at + 7 * HOUR) / DAY) // ngày theo giờ VN
    const newestOfHour = !hours.has(hour)
    const newestOfDay = !days.has(day)
    hours.add(hour)
    days.add(day)
    if (i < KEEP_RECENT) return
    const age = now - s.at
    if (age <= HOURLY_FOR && newestOfHour) return
    if (age <= DAILY_FOR && newestOfDay) return
    out.push(s)
  })
  return out
}
