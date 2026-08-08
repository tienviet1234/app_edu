import { api } from '@/utils/api'

export interface ApiSession {
  _id: string
  classId: string
  centerId?: string
  courseId?: string
  title?: string
  lessonNo?: number
  scheduledAt: string
  durationMinutes: number
  status: 'scheduled' | 'completed' | 'cancelled'
  createdAt: string
  updatedAt: string
}

interface PagedData<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export const sessionService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiSession> }>('/sessions', { params })
      .then((r) => r.data.data),

  create: (body: {
    classId: string
    title?: string
    lessonNo?: number
    scheduledAt?: string
    durationMinutes?: number
  }) =>
    api.post<{ data: ApiSession }>('/sessions', body).then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ data: ApiSession }>(`/sessions/${id}`).then((r) => r.data.data),

  complete: (id: string) =>
    api.post<{ data: ApiSession }>(`/sessions/${id}/complete`, {}).then((r) => r.data.data),
}
