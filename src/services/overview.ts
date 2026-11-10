import { api } from '@/utils/api'
import type { StudentTuitionRule } from '@/business/tuition'

/** Dữ liệu thô cho màn tổng quan toàn trung tâm (server: buildCenterOverview). */
export interface CenterOverview {
  classes: Array<{
    id: string; name: string; level: 'primary' | 'secondary' | null; teacherName: string
    tuitionPerSession: number | null; studentTuition: StudentTuitionRule[]
    students: Array<{ id: string; name: string; sessionOffset?: number }>
  }>
  sessions: Array<{ id: string; classId: string; studentId: string; no: number; date: string; billed: boolean; attendance: 'present' | 'late' | 'excused' | 'absent' | null; total: number | null }>
  notices: Array<{
    id: string; classId: string; studentId: string; periodFrom: number; periodTo: number; periodLabel: string
    sessionIds: string[]; sessionsBilled: number; ratePerSession: number; finalAmount: number
    sentAt: string; paymentStatus: 'paid' | 'unpaid'; paidAt: string | null
  }>
}

export const overviewService = {
  /** Admin: mọi lớp; giáo viên: lớp mình dạy. Chỉ đọc. */
  center: (): Promise<CenterOverview> => api.get('/analytics/center-overview').then((r) => r.data.data),
}
