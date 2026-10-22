/** Bản chụp máy giáo viên nào của 1 máy được XÓA (dọn R2). Trước đây giữ đúng
 *  60 bản mới nhất — máy gửi 5 phút/lần nên 60 bản phủ được nhiều ngày. Giờ máy
 *  gửi dày hơn (tối đa 1 phút/lần khi đang nhập — để kịp chụp trước khi giáo
 *  viên đóng app) nên 60 bản chỉ còn ~1 giờ, mất các bản cũ cần để tra lại khi
 *  dữ liệu trên máy biến mất (sự cố 17–18/10). Quy tắc mới GIỮ:
 *   - 60 bản mới nhất (y như trước — không bao giờ xóa bản nào cách cũ còn giữ);
 *   - trong 3 ngày gần nhất: bản mới nhất của MỖI GIỜ;
 *   - trong 30 ngày gần nhất: bản mới nhất của MỖI NGÀY (giờ VN).
 *  Ngoài ra mới xóa. Tối đa ~60 + 72 + 30 bản / máy. */
export const KEEP_RECENT = 60
const HOUR = 3600e3
const DAY = 24 * HOUR
const HOURLY_FOR = 3 * DAY
const DAILY_FOR = 30 * DAY

export function snapshotsToDelete<T extends { createdAt: Date | string }>(snaps: T[], now: Date = new Date()): T[] {
  const sorted = [...snaps].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const hours = new Set<number>()
  const days = new Set<number>()
  const out: T[] = []
  sorted.forEach((s, i) => {
    const t = new Date(s.createdAt).getTime()
    const age = now.getTime() - t
    const hour = Math.floor(t / HOUR)
    const day = Math.floor((t + 7 * HOUR) / DAY) // ngày theo giờ VN
    const newestOfHour = !hours.has(hour)
    const newestOfDay = !days.has(day)
    hours.add(hour)
    days.add(day)
    if (i < KEEP_RECENT) return
    if (age <= HOURLY_FOR && newestOfHour) return
    if (age <= DAILY_FOR && newestOfDay) return
    out.push(s)
  })
  return out
}
