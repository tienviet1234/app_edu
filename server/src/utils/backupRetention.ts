const KEEP_LATEST = 60 // 2 bản/ngày → khoảng 1 tháng gần nhất
const WEEKLY_FOR_DAYS = 180
const DAY = 24 * 3600 * 1000

/** Thời điểm tạo bản sao lưu, đọc từ tên file `backups/db-2026-11-04T19-00-12-345Z.json`. */
function backupTime(key: string): number | null {
  const m = /db-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(key)
  if (!m) return null
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)
  return Number.isNaN(t) ? null : t
}

/** Bản sao lưu DB nào được dọn. Trước 05/11 chỉ giữ 60 bản mới nhất (khoảng 30
 *  ngày): lỗi phát hiện muộn hơn thì không còn bản nào để lấy lại. Giờ giữ: 60 bản
 *  mới nhất + mỗi tuần 1 bản trong 180 ngày + mỗi tháng 1 bản không thời hạn. File
 *  không đọc được thời điểm thì không xóa. */
export function backupsToDelete(keys: string[], now: number): string[] {
  const dated = keys
    .map((key) => ({ key, t: backupTime(key) }))
    .filter((b): b is { key: string; t: number } => b.t !== null)
    .sort((a, b) => b.t - a.t)
  const keep = new Set(dated.slice(0, KEEP_LATEST).map((b) => b.key))
  const seenWeek = new Set<number>()
  const seenMonth = new Set<string>()
  for (const b of dated) {
    const week = Math.floor(b.t / (7 * DAY))
    if (now - b.t <= WEEKLY_FOR_DAYS * DAY && !seenWeek.has(week)) { seenWeek.add(week); keep.add(b.key) }
    const month = new Date(b.t).toISOString().slice(0, 7)
    if (!seenMonth.has(month)) { seenMonth.add(month); keep.add(b.key) }
  }
  return dated.filter((b) => !keep.has(b.key)).map((b) => b.key)
}
