import { api } from '@/utils/api'

export interface ApiSession {
  _id: string
  classId: string
  studentId?: string
  createdBy?: string | { _id: string; name: string }
  centerId?: string
  courseId?: string
  title?: string
  lessonNo?: number
  scheduledAt: string
  durationMinutes: number
  status: 'scheduled' | 'completed' | 'cancelled'
  /** Lưu "Bài tập về nhà" riêng của học sinh buổi này — field tên "notes" có
   *  sẵn trong model nhưng trước đây không nơi nào dùng tới. */
  notes?: string
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
    studentId?: string
    title?: string
    lessonNo?: number
    scheduledAt?: string
    durationMinutes?: number
    notes?: string
  }) =>
    api.post<{ data: ApiSession }>('/sessions', body).then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ data: ApiSession }>(`/sessions/${id}`).then((r) => r.data.data),

  update: (id: string, body: { title?: string; lessonNo?: number; scheduledAt?: string; durationMinutes?: number; notes?: string }) =>
    api.patch<{ data: ApiSession }>(`/sessions/${id}`, body).then((r) => r.data.data),

  remove: (id: string) =>
    api.delete<{ data: { deleted: boolean } }>(`/sessions/${id}`).then((r) => r.data.data),

  /** Khôi phục 1 buổi đã "xóa" (soft delete) — điểm/bài tập/ghi chú/điểm danh
   *  chưa từng bị động tới nên trở lại y hệt trước khi xóa. */
  restore: (id: string) =>
    api.post<{ data: ApiSession }>(`/sessions/${id}/restore`, {}).then((r) => r.data.data),

  complete: (id: string) =>
    api.post<{ data: ApiSession }>(`/sessions/${id}/complete`, {}).then((r) => r.data.data),
}
