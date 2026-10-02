import { api } from '@/utils/api'

export interface DateSplitGroup {
  date: string
  studentIds: string[]
  studentNames: string[]
}

export interface DateSplitSummary {
  classId: string
  className: string
  lessonNo: number
  groups: DateSplitGroup[]
  suggestedDate: string
  sessionIdsToFix: string[]
}

export const sessionDateReconcileService = {
  /** Xem trước — KHÔNG ghi gì, an toàn gọi nhiều lần. */
  preview: (): Promise<{ summaries: DateSplitSummary[] }> =>
    api.get('/admin/session-date-reconcile/preview').then((r) => r.data.data),

  /** Sửa thật — bỏ trống `classId`/`lessonNo` để sửa TẤT CẢ, hoặc truyền vào
   *  để chỉ sửa đúng 1 dòng (1 lớp + 1 buổi). */
  run: (opts?: { classId?: string; lessonNo?: number }): Promise<{ fixed: number; backup: unknown[] }> =>
    api.post('/admin/session-date-reconcile/run', { confirm: true, ...opts }).then((r) => r.data.data),
}
