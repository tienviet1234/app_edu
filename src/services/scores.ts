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
}

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
    api.post<{ data: ApiScore }>('/scores/upsert', body).then((r) => r.data.data),

  sessionSummary: (sessionId: string) =>
    api
      .get<{ data: ApiScore[] }>(`/scores/session/${sessionId}/summary`)
      .then((r) => r.data.data),
}
