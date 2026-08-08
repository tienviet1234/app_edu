import { api } from '@/utils/api'

export interface ApiReport {
  _id: string
  classId: string
  studentId: string | { _id: string; name: string }
  teacherId?: string
  period: { from: string; to: string; label: string }
  title: string
  summary: string
  comment: string
  strengths: string[]
  improvements: string[]
  score?: number
  status: 'draft' | 'published' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface UpsertReportBody {
  classId: string
  studentId: string
  period: { from: string; to: string; label: string }
  title: string
  summary: string
  comment?: string
  strengths?: string[]
  improvements?: string[]
  score?: number
  status?: 'draft' | 'published'
}

export const reportService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: { items: ApiReport[]; total: number } }>('/reports', { params })
      .then((r) => r.data.data),

  upsert: (body: UpsertReportBody) =>
    api.post<{ data: ApiReport }>('/reports/upsert', body).then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ data: ApiReport }>(`/reports/${id}`).then((r) => r.data.data),

  publish: (id: string) =>
    api.post<{ data: ApiReport }>(`/reports/${id}/publish`).then((r) => r.data.data),
}
