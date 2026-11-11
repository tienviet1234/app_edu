// Câu hỏi lại + chốt chặn cho các nút đụng tới TIỀN ở màn Học phí (11/11). Mỗi câu nêu ĐÚNG
// em nào, kỳ nào, bao nhiêu tiền, và việc gì sẽ xảy ra với các buổi — trước đây "Đã đóng tiền",
// "Hoàn tác đóng" ghi luôn không hỏi; "Xóa (ghi nhầm)" không nói số tiền.

const vnd = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`

export interface NoticeLike { periodLabel: string; finalAmount: number; paymentStatus?: string; sessionIds?: string[] }

/** Y HỆT `noticeDeleteBlockReason` ở server (dataRules.ts) — có test đối chiếu. */
export function noticeDeleteBlock(notice: { paymentStatus?: string; periodLabel?: string }): string | null {
  return notice.paymentStatus === 'paid'
    ? `Phiếu "${notice.periodLabel ?? ''}" đã ghi nhận ĐÃ ĐÓNG TIỀN — không xóa được. Nếu ghi nhầm: bấm "chuyển lại chưa đóng" trước, rồi mới xóa.`
    : null
}

export function sendNoticeConfirm(row: { studentName: string; periodLabel: string; sessionsBilled: number; sessionCount: number; computedAmount: number; finalAmount: number; adjustmentReason?: string }): string {
  const adj = row.finalAmount !== row.computedAmount ? ` (tự tính ${vnd(row.computedAmount)}, điều chỉnh: ${row.adjustmentReason?.trim() || '—'})` : ''
  return `Ghi nhận ĐÃ GỬI phiếu học phí cho ${row.studentName}:\n\n${row.periodLabel} — ${row.sessionsBilled} buổi tính tiền — ${vnd(row.finalAmount)}${adj}\n\n` +
    `${row.sessionCount} buổi của kỳ này sẽ mang dấu "đã thu" (không bị tính lại kỳ sau). Gửi?`
}

export function deleteNoticeConfirm(studentName: string, n: NoticeLike): string {
  const k = n.sessionIds?.length ?? 0
  return `Xóa phiếu "${n.periodLabel}" — ${vnd(n.finalAmount)} của ${studentName}? Chỉ dùng khi ghi nhầm.\n\n` +
    (k ? `${k} buổi của phiếu này sẽ trở lại "chưa thu" và hiện lại ở mục đến hạn để gửi lại cho đúng.` : 'Sau đó có thể chốt/gửi lại kỳ này cho đúng.')
}

export function markPaidConfirm(studentName: string, n: NoticeLike, className?: string): string {
  return `Ghi nhận ${studentName}${className ? ` (${className})` : ''} ĐÃ ĐÓNG ${vnd(n.finalAmount)} cho "${n.periodLabel}"?`
}

export function markUnpaidConfirm(studentName: string, n: NoticeLike): string {
  return `Chuyển "${n.periodLabel}" — ${vnd(n.finalAmount)} của ${studentName} về CHƯA ĐÓNG? Chỉ dùng khi ghi nhận đóng tiền nhầm (phụ huynh chưa chuyển, ghi nhầm em).`
}
