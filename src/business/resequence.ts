import type { Session } from '@/types'

/** Sắp xếp buổi học theo đúng thứ tự ngày học thật — cùng ngày thì giữ theo
 *  số buổi (`no`) hiện tại để thứ tự ổn định, không đổi lung tung giữa các
 *  lần gọi khác nhau. */
export function sortSessionsByDate<T extends Pick<Session, 'id' | 'date' | 'no'>>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
}

/** Tính số buổi ĐÚNG (1..N liên tục, không bỏ số, không trùng) theo đúng thứ
 *  tự ngày học thật — trả về map sessionId → số buổi mới, KHÔNG tự ghi gì cả.
 *  Dùng cho nút "💡 Gợi ý: điền sẵn theo thứ tự ngày học"
 *  (`ResequenceSessionsModal`) và khi sửa dữ liệu bị lệch số hàng loạt (xem
 *  gotcha "Lớp 7 bị sai buổi" ở CLAUDE.md — 1 lần lưu đổi chéo số buổi bị lỗi
 *  mạng giữa chừng để lại buổi kẹt ở số tạm/dải +1000, phải xếp lại từ đầu). */
export function sequentialNumbering<T extends Pick<Session, 'id' | 'date' | 'no'>>(
  sessions: T[],
): Record<string, number> {
  return Object.fromEntries(sortSessionsByDate(sessions).map((s, i) => [s.id, i + 1]))
}
