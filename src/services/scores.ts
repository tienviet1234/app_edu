import { api } from '@/utils/api'
import type { AttendanceKey } from '@/types'

export interface ApiScore {
  _id: string
  sessionId: string
  classId: string
  studentId: string
  centerId?: string
  rubricId?: string
  attendance: AttendanceKey
  scores: Record<string, number>
  tags: Record<string, string[]>
  ticks: Record<string, string[]>
  choice: Record<string, string>
  parts: Record<string, Record<string, number>>
  skip: Record<string, boolean>
  ev: Record<string, unknown>
  note?: string
  total: number
  createdAt: string
  updatedAt: string
}

export interface UpsertScoreBody {
  classId: string
  sessionId: string
  studentId: string
  attendance: AttendanceKey
  scores?: Record<string, string | number>
  tags?: Record<string, string[]>
  ticks?: Record<string, string[]>
  choice?: Record<string, string>
  parts?: Record<string, Record<string, string | number>>
  skip?: Record<string, boolean>
  ev?: Record<string, unknown>
  note?: string
  total: number
  /** Chỉ ghi khi server CHƯA có điểm em này ở buổi này (và buổi chưa bị
   *  xóa) — trả về `skipped: true` (kèm điểm đang có) thay vì ghi đè. Dùng
   *  cho đồng bộ nền/khôi phục, không dùng khi giáo viên đang tự sửa điểm. */
  ifAbsent?: boolean
  /** Mốc bản server máy đã dựa vào để sửa — server có bản mới hơn (máy khác
   *  vừa lưu) thì trả 409 CONFLICT thay vì đè mất. Xem Session.baseUpdatedAt. */
  baseUpdatedAt?: string
}

/** Đọc bản điểm máy kia từ lỗi 409 CONFLICT (null nếu không phải lỗi này). */
export function conflictFromError(err: unknown): { score: ApiScore & { recordedBy?: { name?: string } | string } } | null {
  const resp = (err as { response?: { status?: number; data?: { code?: string; data?: { score?: ApiScore } } } }).response
  if (resp?.status !== 409 || resp.data?.code !== 'CONFLICT' || !resp.data.data?.score) return null
  return { score: resp.data.data.score as ApiScore & { recordedBy?: { name?: string } | string } }
}

/** Server từ chối lưu vì buổi đã bị xóa trên server (409 SESSION_DELETED). */
export function isSessionDeletedError(err: unknown): boolean {
  const resp = (err as { response?: { status?: number; data?: { code?: string } } }).response
  return resp?.status === 409 && resp.data?.code === 'SESSION_DELETED'
}

export type UpsertScoreResult = ApiScore & { skipped?: boolean; deleted?: boolean }

export const scoreService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: { items: ApiScore[]; total: number } }>('/scores', { params })
      .then((r) => r.data.data),

  /** Lấy TẤT CẢ điểm khớp bộ lọc — server cắt tối đa 100 dòng/trang nên phải
   *  đi từng trang, nếu không phần ngoài 100 dòng đầu sẽ biến mất khỏi màn hình. */
  listAll: async (params: Record<string, string>) => {
    const items: ApiScore[] = []
    let total = 0
    for (let page = 1; page <= 100; page++) {
      const r = await scoreService.list({ ...params, limit: '100', page: String(page) })
      items.push(...r.items)
      total = r.total
      if (!r.items.length || items.length >= total) break
    }
    return { items, total }
  },

  upsert: (body: UpsertScoreBody) =>
    api.post<{ data: UpsertScoreResult }>('/scores/upsert', body).then((r) => r.data.data),

  sessionSummary: (sessionId: string) =>
    api
      .get<{ data: ApiScore[] }>(`/scores/session/${sessionId}/summary`)
      .then((r) => r.data.data),
}
