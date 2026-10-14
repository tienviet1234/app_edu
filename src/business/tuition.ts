import type { Session, Student } from '@/types'

/** Loại BỎ các buổi ĐÃ TÍNH TIỀN (`session.billed === true`) ra khỏi danh
 *  sách — dùng TRƯỚC KHI đưa vào `billingPeriodsOf`/`currentProgressOf`/
 *  `sessionsBilledOf`/`sessionDetailsOf`/`statsOf`, để các hàm này chỉ thấy
 *  đúng những buổi THẬT SỰ CHƯA được tính tiền. Vì sao cần: các hàm trên chỉ
 *  đếm SỐ LƯỢNG buổi còn lại để biết "đã đủ kỳ chưa" — nếu xóa 1 buổi lỗi/
 *  trùng nằm TRONG 1 kỳ ĐÃ thu tiền rồi (xóa đúng, cần xóa), số lượng còn
 *  lại tụt xuống, hệ thống sẽ "quên" là các buổi còn sót đã thu tiền và đếm
 *  lại chúng như buổi MỚI — dẫn tới thu tiền trùng nếu admin bấm chốt buổi
 *  lần nữa. Gọi hàm này trước là cách duy nhất chặn đúng gốc, KHÔNG sửa
 *  logic đếm/tính kỳ bên trong 3 hàm kia (giữ nguyên, đã có nhiều test). */
export function unbilledSessionsOf<T extends Pick<Student, 'sessions'>>(student: T): Session[] {
  return student.sessions.filter((s) => !s.billed)
}

/** Vị trí 1 buổi (`no` = số buổi THẬT, liên tục, không đổi) bên trong kỳ/tháng
 *  của nó — `period` = kỳ thứ mấy (1-based), `displayNo` = số buổi hiển thị
 *  CHO NGƯỜI DÙNG, tự reset về 1 mỗi khi qua kỳ mới (đủ 8/12 buổi thật).
 *  Đây là hàm DUY NHẤT trong app quyết định "buổi N hiển thị thành gì" — mọi
 *  màn hình phải gọi qua đây (hoặc `sessionLabelOf` bên dưới), KHÔNG tự chế
 *  công thức riêng, để tránh lặp lại lỗi đã gặp (nhiều nơi tự tính nhãn buổi
 *  khác nhau, lệch số giữa các màn hình). `no` CHÍNH NÓ không đổi gì — vẫn là
 *  số đếm liên tục lưu thật trên server, dùng để sắp xếp/chống trùng/sửa
 *  buổi như trước giờ. `offset` = `student.sessionOffset` (xem
 *  billingPeriodsOf) — mặc định 0 cho mọi học sinh khác. */
export function periodPositionOf(
  no: number, perMonth: number, offset = 0,
): { period: number; displayNo: number; blockSize: number } {
  const blockSize = perMonth === 8 ? 8 : 12
  const conceptual = no + offset
  const period = Math.ceil(conceptual / blockSize)
  const displayNo = conceptual - (period - 1) * blockSize
  return { period, displayNo, blockSize }
}

/** Nhãn ngắn gọn cho 1 buổi, dùng ở mọi nơi hiển thị "Buổi N" cho giáo
 *  viên/phụ huynh (dropdown chọn buổi, bảng điểm, Excel...) — "Buổi 1 · T.2"
 *  khi đã qua kỳ 2 trở đi, chỉ "Buổi N" ở kỳ đầu (đỡ rối cho ca thường gặp
 *  nhất). KHÔNG dùng ở các công cụ sửa/đối chiếu dữ liệu (resequence, sửa
 *  buổi thật, đối chiếu lệch buổi...) — những chỗ đó cần thấy đúng số thật
 *  liên tục, xem ghi chú ở từng màn hình. */
export function sessionLabelOf(no: number, perMonth: number, offset = 0): string {
  const { period, displayNo } = periodPositionOf(no, perMonth, offset)
  return period > 1 ? `Buổi ${displayNo} · T.${period}` : `Buổi ${displayNo}`
}

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
    const pFrom = periodPositionOf(from + 1, perMonth, offset)
    const pTo = periodPositionOf(to, perMonth, offset)
    const label = pFrom.period > 1
      ? `Tháng ${pFrom.period} (Buổi ${pFrom.displayNo}–${pTo.displayNo})`
      : `Buổi ${pFrom.displayNo}–${pTo.displayNo}`
    periods.push({ from, to, label })
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
