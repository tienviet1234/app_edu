/** Khóa theo id buổi (id trên máy) — đồng bộ nền lúc mở app (App.tsx) và bộ
 *  tự lưu ở Nhập điểm có thể cùng lúc định gửi 1 buổi. Gửi song song 1 buổi
 *  MỚI sẽ tạo 2 lần trên server (lần 2 bị 409 SAME_DATE, báo lỗi giả). */
const inFlight = new Set<string>()

export function tryLockSession(sessionLocalId: string): boolean {
  if (inFlight.has(sessionLocalId)) return false
  inFlight.add(sessionLocalId)
  return true
}

export function unlockSession(sessionLocalId: string): void {
  inFlight.delete(sessionLocalId)
}
