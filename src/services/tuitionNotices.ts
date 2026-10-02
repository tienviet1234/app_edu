import { api } from '@/utils/api'

export type TuitionPaymentStatus = 'unpaid' | 'paid'

export interface TuitionNotice {
  _id: string
  classId: string
  studentId: string
  periodFrom: number
  periodTo: number
  periodLabel: string
  sessionsBilled: number
  ratePerSession: number
  computedAmount: number
  finalAmount: number
  adjustmentReason?: string
  reportComment: string
  sentAt: string
  sentBy: string
  // Đã THU ĐƯỢC TIỀN hay chưa — khác hẳn "đã gửi" ở trên (sentAt).
  paymentStatus: TuitionPaymentStatus
  paidAt?: string
  paidBy?: string
}

export const tuitionNoticeService = {
  /** Lịch sử đã gửi báo cáo+học phí của cả lớp. */
  list: (classId: string): Promise<TuitionNotice[]> =>
    api.get('/tuition-notices', { params: { classId } }).then((r) => r.data.data),

  /** Đánh dấu ĐÃ GỬI 1 kỳ cho 1 học sinh — đây là hồ sơ tiền bạc, không có
   *  hàm "sửa", ghi nhầm thì remove() rồi tạo lại cho đúng. */
  create: (payload: {
    classId: string; studentId: string
    periodFrom: number; periodTo: number; periodLabel: string
    sessionsBilled: number; ratePerSession: number
    computedAmount: number; finalAmount: number
    adjustmentReason?: string; reportComment: string
  }): Promise<TuitionNotice> =>
    api.post('/tuition-notices', payload).then((r) => r.data.data),

  /** Xóa hồ sơ ghi nhầm (VD đánh dấu sai học sinh). */
  remove: (id: string): Promise<void> =>
    api.delete(`/tuition-notices/${id}`).then(() => undefined),

  /** Đánh dấu ĐÃ THU ĐƯỢC TIỀN cho đúng kỳ này — làm sau khi "đã gửi", có thể
   *  trễ hơn rất nhiều (phụ huynh khất, đóng dồn nhiều kỳ...). */
  markPaid: (id: string): Promise<TuitionNotice> =>
    api.put(`/tuition-notices/${id}/paid`).then((r) => r.data.data),

  /** Hoàn tác "đã đóng tiền" nếu lỡ bấm nhầm. */
  markUnpaid: (id: string): Promise<TuitionNotice> =>
    api.put(`/tuition-notices/${id}/unpaid`).then((r) => r.data.data),

  /** Đếm nhanh số khoản "đang nợ học phí" trên TẤT CẢ lớp đang dạy — dùng
   *  để hiện chấm nhắc ở menu, không cần mở từng lớp mới biết. */
  getSummary: (): Promise<{ unpaidCount: number }> =>
    api.get('/tuition-notices/summary').then((r) => r.data.data),
}
