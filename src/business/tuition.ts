import type { Student } from '@/types'

/** Mốc TÍNH HỌC PHÍ — CHỈ đúng mốc "cuối 8 buổi" (perMonth=8) hoặc "cuối 12
 *  buổi" (perMonth khác) — KHÁC với periodsOf() ở business/report.ts (dùng
 *  cho báo cáo học tập, có thêm mốc "giữa kỳ" 6 buổi mang tính thông tin,
 *  không phải mốc thu tiền). Không dùng chung periodsOf() ở đây để tránh
 *  tính trùng tiền 2 lần cho cùng 1 buổi (periodsOf's "giữa kỳ"/"tổng kết"
 *  CHỒNG LẤN nhau trong cùng 1 khối 12 buổi).
 *  Mỗi khối liên tiếp, không chồng lấn: buổi 1–8, 9–16, 17–24... (hoặc
 *  1–12, 13–24... tùy perMonth).
 *
 *  `student.sessionOffset` (số buổi đã học TRƯỚC KHI vào app, vd học sinh
 *  chuyển vào giữa chừng) dịch mốc tính kỳ theo đúng số buổi THẬT — kỳ đầu
 *  tiên có thể NGẮN HƠN 1 khối (chỉ còn đủ phần lẻ cho tới mốc 8/12 gần nhất),
 *  các kỳ sau quay lại đúng 1 khối trọn vẹn. `from`/`to` vẫn luôn là CHỈ SỐ
 *  MẢNG thật của `student.sessions` (không phải số buổi hiển thị) — offset=0
 *  (mặc định, mọi học sinh khác) cho kết quả giống hệt 100% công thức cũ. */
export function billingPeriodsOf(
  student: Pick<Student, 'sessions' | 'sessionOffset'>, perMonth: number,
): Array<{ from: number; to: number; label: string }> {
  const n = student.sessions.length
  const offset = student.sessionOffset ?? 0
  const blockSize = perMonth === 8 ? 8 : 12
  const periods: Array<{ from: number; to: number; label: string }> = []
  for (let k = 1; ; k++) {
    const conceptualTo = k * blockSize
    const to = conceptualTo - offset
    if (to <= 0) continue // kỳ này đã xong TRƯỚC KHI vào app — không có gì để hiện
    if (to > n) break
    const from = Math.max(0, (k - 1) * blockSize - offset)
    periods.push({ from, to, label: `Buổi ${from + 1 + offset}–${to + offset}` })
  }
  return periods
}

/** Số buổi THỰC TẾ TÍNH PHÍ trong 1 khoảng [from, to) — tính buổi CÓ MẶT,
 *  ĐI MUỘN, hoặc NGHỈ CÓ PHÉP (giữ chỗ/đã dạy hoặc đã báo trước, vẫn tính
 *  tiền), CHỈ KHÔNG tính buổi NGHỈ KHÔNG PHÉP — theo đúng quy ước trung tâm
 *  đã xác nhận lại. Buổi nghỉ có phép vẫn hiện rõ "Nghỉ có phép" ở cột Nhận
 *  xét (xem sessionStatusText/ATTENDANCE_NOTE) để phụ huynh hiểu vì sao vẫn
 *  bị tính phí dù không đi học hôm đó. */
export function sessionsBilledOf(student: Pick<Student, 'sessions'>, from: number, to: number): number {
  return student.sessions
    .slice(from, to)
    .filter((s) => s.entry.attendance === 'present' || s.entry.attendance === 'late' || s.entry.attendance === 'excused')
    .length
}

/** Tiến độ buổi học của kỳ ĐANG DỞ (chưa đủ mốc 8/12 để tính phí) — dùng để
 *  vẫn hiện được TẤT CẢ học sinh trên màn Báo cáo + Học phí (không chỉ em
 *  nào đã tới hạn), tránh cảm giác "lớp này chưa ai cần quan tâm" khi thật
 *  ra cả lớp vẫn đang học dở kỳ. `current` = số buổi đã có trong kỳ dở này
 *  (kể cả buổi nghỉ — đếm theo đúng "đã ghi buổi" để thấy tiến độ thời gian,
 *  khác với sessionsBilledOf chỉ đếm buổi tính tiền). Trả về null nếu học
 *  sinh đang NẰM ĐÚNG ở ranh giới 1 kỳ vừa xong (billingPeriodsOf đã có kỳ
 *  đó rồi, không cần hiện tiến độ trùng).
 *
 *  Cộng `student.sessionOffset` (xem billingPeriodsOf) vào tổng trước khi
 *  tính phần dư, để hiện đúng tiến độ THẬT kể cả khi mới có 1-2 buổi trong
 *  app (VD offset=9, n=1 → "10/12", không phải "1/12"). */
export function currentProgressOf(
  student: Pick<Student, 'sessions' | 'sessionOffset'>, perMonth: number,
): { current: number; total: number } | null {
  const n = student.sessions.length
  if (n === 0) return null // chưa ghi buổi nào trong app — chưa có gì để hiện tiến độ
  const offset = student.sessionOffset ?? 0
  const blockSize = perMonth === 8 ? 8 : 12
  const current = (offset + n) % blockSize
  if (current === 0) return null // vừa đúng 1 kỳ (đã có trong billingPeriodsOf)
  return { current, total: blockSize }
}
