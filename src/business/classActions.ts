// Câu hỏi lại cho các nút ở màn Lớp học (11/11) — nêu đúng việc sẽ xảy ra với buổi học / học phí.
import { sessionLabelOf } from './tuition'

export function levelChangeConfirm(className: string, to: 'primary' | 'secondary'): string {
  const per = to === 'primary' ? 8 : 12
  return `Đổi lớp ${className} sang ${to === 'primary' ? 'Cấp 1' : 'Cấp 2 & 3'} — ${per} buổi/tháng?\n\n` +
    `Mọi kỳ học phí CHƯA gửi phiếu sẽ tính lại theo ${per} buổi/kỳ, nhãn buổi đổi theo ("Buổi m/${per}"). Phiếu đã gửi giữ nguyên.`
}

export function offsetChangeConfirm(studentName: string, from: number, to: number, perMonth: number): string {
  return `Đổi số buổi ${studentName} đã học TRƯỚC khi vào app: ${from} → ${to}?\n\n` +
    `Buổi đầu tiên trong app sẽ thành ${sessionLabelOf(1, perMonth, to)} và mốc kỳ học phí dời theo. Phiếu đã gửi giữ nguyên.`
}

export function removeStudentConfirm(studentName: string, className: string, sessions: Array<{ billed?: boolean }>, unsent: number): string {
  const unbilled = sessions.filter((s) => !s.billed).length
  return `Gỡ ${studentName} khỏi ${className}?\n\n` +
    `Em có ${sessions.length} buổi${unbilled ? `, trong đó ${unbilled} buổi CHƯA thu tiền — sau khi gỡ, các buổi này không còn hiện ở màn Học phí của lớp để nhắc thu` : ''}. ` +
    `Buổi và điểm trên server vẫn giữ.` +
    (unsent ? ` ${unsent} buổi chưa lên server sẽ chuyển vào "kho giữ lại" (admin xem ở Sao lưu → Dữ liệu kẹt).` : '')
}
