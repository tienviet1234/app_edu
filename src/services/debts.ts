import { api } from '@/utils/api'

export type DebtKind = 'btvn' | 'chep_phat' | 'vocab' | 'other'
export type DebtStatus = 'pending' | 'submitted' | 'cleared'

export interface Debt {
  _id: string
  classId: string
  studentId: string
  createdBy: string
  kind: DebtKind
  label: string
  status: DebtStatus
  answerText?: string
  submittedAt?: string
  clearedAt?: string
  createdAt: string
  updatedAt: string
}

export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  btvn: '📚 BTVN trễ',
  chep_phat: '✍️ Chép phạt',
  vocab: '🔤 Từ vựng',
  other: '📌 Khác',
}

export const debtService = {
  /** Giáo viên: liệt kê nợ của cả lớp (studentId/status không bắt buộc, lọc thêm nếu có).
   *  Học sinh/phụ huynh: liệt kê nợ của ĐÚNG 1 học sinh (bắt buộc studentId). */
  list: (params: { classId?: string; studentId?: string; status?: DebtStatus }): Promise<Debt[]> =>
    api.get('/debts', { params }).then((r) => r.data.data),

  /** Giáo viên ghi nợ mới cho 1 học sinh cụ thể. */
  create: (payload: { classId: string; studentId: string; kind: DebtKind; label: string }): Promise<Debt> =>
    api.post('/debts', payload).then((r) => r.data.data),

  /** Học sinh/phụ huynh trả nợ — gõ nội dung (VD list từ vựng: nghĩa). */
  submit: (id: string, answerText: string): Promise<Debt> =>
    api.post(`/debts/${id}/submit`, { answerText }).then((r) => r.data.data),

  /** Giáo viên xác nhận đã xong (không cần học sinh nộp trước cũng xác nhận được). */
  clear: (id: string): Promise<Debt> => api.put(`/debts/${id}/clear`).then((r) => r.data.data),

  /** Giáo viên trả lại "chưa xong" nếu bài nộp trả nợ chưa đạt. */
  reject: (id: string): Promise<Debt> => api.put(`/debts/${id}/reject`).then((r) => r.data.data),

  /** Giáo viên xoá khoản nợ ghi nhầm. */
  remove: (id: string): Promise<void> => api.delete(`/debts/${id}`).then(() => undefined),
}
