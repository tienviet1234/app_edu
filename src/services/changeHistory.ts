import { api } from '@/utils/api'

export interface FieldChange { field: string; before: string | null; after: string | null }

export interface ScoreContent {
  attendance: string
  scores: Record<string, unknown>; tags: Record<string, unknown>; ticks: Record<string, unknown>
  choice: Record<string, unknown>; parts: Record<string, unknown>; skip: Record<string, unknown>; ev: Record<string, unknown>
  note: string
  total: number
}

export interface ScoreVersion {
  id: string
  at: string
  op: string
  /** Người ghi lần sửa NGAY SAU bản này (tra nhật ký) — null nếu không tìm thấy. */
  by: string | null
  totalBefore: number | null
  totalAfter: number | null
  changes: FieldChange[]
  /** Nội dung điểm TRƯỚC lần sửa này — đúng cái sẽ được ghi lại khi khôi phục. */
  before: ScoreContent
}

export interface SessionHistory {
  session: { _id: string; studentId: string; classId: string; lessonNo: number; scheduledAt: string; deletedAt: string | null; billed: boolean }
  score: ScoreContent | null
  scoreUpdatedAt: string | null
  scoreVersions: ScoreVersion[]
  sessionVersions: Array<{ id: string; at: string; op: string; by: string | null; changes: FieldChange[] }>
}

export interface StudentChange {
  id: string; at: string; coll: 'scores' | 'classsessions'; op: string
  sessionId: string | null; lessonNo: number | null; scheduledAt: string | null; sessionDeleted: boolean
}

/** Lịch sử điểm + khôi phục phiên bản cũ — chỉ admin (server/src/controllers/changeHistoryController.ts). */
export const changeHistoryService = {
  ofSession: (sessionId: string): Promise<SessionHistory> =>
    api.get(`/admin/change-histories/sessions/${sessionId}`).then((r) => r.data.data),
  ofStudent: (studentId: string): Promise<StudentChange[]> =>
    api.get(`/admin/change-histories/students/${studentId}`).then((r) => r.data.data),
  restore: (historyId: string): Promise<{ restored: boolean; score: ScoreContent }> =>
    api.post(`/admin/change-histories/${historyId}/restore`).then((r) => r.data.data),
}
