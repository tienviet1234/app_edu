import type { Student } from '@/types'

/** Mốc TÍNH HỌC PHÍ — CHỈ đúng mốc "cuối 8 buổi" (perMonth=8) hoặc "cuối 12
 *  buổi" (perMonth khác) — KHÁC với periodsOf() ở business/report.ts (dùng
 *  cho báo cáo học tập, có thêm mốc "giữa kỳ" 6 buổi mang tính thông tin,
 *  không phải mốc thu tiền). Không dùng chung periodsOf() ở đây để tránh
 *  tính trùng tiền 2 lần cho cùng 1 buổi (periodsOf's "giữa kỳ"/"tổng kết"
 *  CHỒNG LẤN nhau trong cùng 1 khối 12 buổi).
 *  Mỗi khối liên tiếp, không chồng lấn: buổi 1–8, 9–16, 17–24... (hoặc
 *  1–12, 13–24... tùy perMonth). */
export function billingPeriodsOf(
  student: Pick<Student, 'sessions'>, perMonth: number,
): Array<{ from: number; to: number; label: string }> {
  const n = student.sessions.length
  const blockSize = perMonth === 8 ? 8 : 12
  const periods: Array<{ from: number; to: number; label: string }> = []
  for (let end = blockSize; end <= n; end += blockSize) {
    periods.push({ from: end - blockSize, to: end, label: `Buổi ${end - blockSize + 1}–${end}` })
  }
  return periods
}

/** Số buổi THỰC TẾ TÍNH PHÍ trong 1 khoảng [from, to) — chỉ tính buổi CÓ MẶT
 *  hoặc ĐI MUỘN (giữ chỗ/đã dạy), KHÔNG tính buổi nghỉ (có phép hay không
 *  phép đều không tính) — theo đúng quy ước trung tâm đã xác nhận. */
export function sessionsBilledOf(student: Pick<Student, 'sessions'>, from: number, to: number): number {
  return student.sessions
    .slice(from, to)
    .filter((s) => s.entry.attendance === 'present' || s.entry.attendance === 'late')
    .length
}

/** Tiến độ buổi học của kỳ ĐANG DỞ (chưa đủ mốc 8/12 để tính phí) — dùng để
 *  vẫn hiện được TẤT CẢ học sinh trên màn Báo cáo + Học phí (không chỉ em
 *  nào đã tới hạn), tránh cảm giác "lớp này chưa ai cần quan tâm" khi thật
 *  ra cả lớp vẫn đang học dở kỳ. `current` = số buổi đã có trong kỳ dở này
 *  (kể cả buổi nghỉ — đếm theo đúng "đã ghi buổi" để thấy tiến độ thời gian,
 *  khác với sessionsBilledOf chỉ đếm buổi tính tiền). Trả về null nếu học
 *  sinh đang NẰM ĐÚNG ở ranh giới 1 kỳ vừa xong (billingPeriodsOf đã có kỳ
 *  đó rồi, không cần hiện tiến độ trùng). */
export function currentProgressOf(
  student: Pick<Student, 'sessions'>, perMonth: number,
): { current: number; total: number } | null {
  const n = student.sessions.length
  const blockSize = perMonth === 8 ? 8 : 12
  const current = n % blockSize
  if (current === 0) return null // n=0 (chưa học buổi nào) hoặc vừa đúng 1 kỳ (đã có trong billingPeriodsOf)
  return { current, total: blockSize }
}
