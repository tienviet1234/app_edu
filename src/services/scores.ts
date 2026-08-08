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

  upsert: (body: UpsertScoreBody) =>
    api.post<{ data: ApiScore }>('/scores/upsert', body).then((r) => r.data.data),

  sessionSummary: (sessionId: string) =>
    api
      .get<{ data: ApiScore[] }>(`/scores/session/${sessionId}/summary`)
      .then((r) => r.data.data),
}
