import { api } from '@/utils/api'

export interface TeacherPayRecord {
  _id: string
  teacherId: string
  from: string
  to: string
  amount: number
  note?: string
  paidAt: string
  paidBy: string
}

export const teacherPayService = {
  /** Đã trả lương cho ai trong khoảng ngày này chưa (admin). */
  list: (from: string, to: string): Promise<TeacherPayRecord[]> =>
    api.get('/teacher-pay', { params: { from, to } }).then((r) => r.data.data),

  /** Đánh dấu ĐÃ TRẢ LƯƠNG — admin xác nhận sau khi đã chuyển khoản thật. */
  markPaid: (payload: { teacherId: string; from: string; to: string; amount: number; note?: string }): Promise<TeacherPayRecord> =>
    api.post('/teacher-pay', payload).then((r) => r.data.data),

  /** Hoàn tác đánh dấu nhầm. */
  remove: (id: string): Promise<void> =>
    api.delete(`/teacher-pay/${id}`).then(() => undefined),
}
