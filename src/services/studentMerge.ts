import { api } from '@/utils/api'

export interface MergeCandidate {
  _id: string
  name: string
  email: string
  avatar?: string
  currentClass: { classId: string; className: string } | null
}

export interface MergeSessionRow {
  sessionId: string
  scheduledAt: string
  oldLessonNo: number | null
  newLessonNo: number
  source: 'old' | 'new'
  billed: boolean
}

export interface MergeNoticeRow {
  periodLabel: string
  finalAmount: number
  paymentStatus: string
  sentAt: string
}

export interface MergePlan {
  fromClassId: string
  fromClassName: string
  toClassId: string
  toClassName: string
  oldStudentId: string
  newStudentId: string
  rows: MergeSessionRow[]
  notices: MergeNoticeRow[]
  debtsCount: number
  reportsCount: number
  billedCount: number
}

export interface RunMergeResult {
  plan: MergePlan
  backup: {
    oldSessions: unknown[]
    newSessions: unknown[]
    tuitionNotices: unknown[]
    debts: unknown[]
    reports: unknown[]
  }
}

export interface MergeStudentParams {
  oldStudentId: string
  newStudentId: string
  fromClassId: string
  toClassId: string
}

/** Gộp 2 tài khoản của cùng 1 học sinh (chuyển lớp giữa kỳ bị tạo trùng tài
 *  khoản) — xem ghi chú đầy đủ ở server/src/services/studentMergeService.ts.
 *  Chỉ admin/giáo viên (trong lớp mình dạy) dùng được. */
export const studentMergeService = {
  /** Tìm học sinh theo tên/email trong toàn hệ thống — trả về kèm lớp hiện
   *  tại (nếu có) để chọn đúng tài khoản đích. */
  search: (q: string, excludeId: string): Promise<{ items: MergeCandidate[] }> =>
    api.get('/admin/student-merges/search', { params: { q, excludeId } }).then((r) => r.data.data),

  /** Xem trước — KHÔNG ghi gì, an toàn gọi nhiều lần. */
  preview: (params: MergeStudentParams): Promise<{ plan: MergePlan }> =>
    api.get('/admin/student-merges/preview', { params }).then((r) => r.data.data),

  /** Chạy thật — ghi dữ liệu thật, đổi cả học phí đã thu. */
  run: (params: MergeStudentParams): Promise<RunMergeResult> =>
    api.post('/admin/student-merges', { ...params, confirm: true }).then((r) => r.data.data),
}
