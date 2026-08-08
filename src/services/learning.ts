import { api } from '@/utils/api'

interface PagedData<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export interface ApiCourseDetail {
  _id: string
  centerId?: string
  name: string
  code?: string
  description?: string
  level?: 'primary' | 'secondary' | 'high' | 'adult'
  totalSessions?: number
  sessionDuration?: number
  status: 'draft' | 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface ApiLesson {
  _id: string
  courseId: string
  centerId?: string
  no: number
  title: string
  objectives: string[]
  materials: string[]
  duration: number
  activities?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type CreateLessonBody = {
  centerId: string
  courseId: string
  no: number
  title: string
  objectives?: string[]
  materials?: string[]
  duration?: number
  activities?: string
  notes?: string
}

export type UpdateLessonBody = Partial<Omit<CreateLessonBody, 'centerId' | 'courseId'>>

export const learningService = {
  listCourses: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiCourseDetail> }>('/courses', { params })
      .then((r) => r.data.data),

  getCourse: (id: string) =>
    api.get<{ data: ApiCourseDetail }>(`/courses/${id}`).then((r) => r.data.data),

  listLessons: (courseId: string) =>
    api
      .get<{ data: PagedData<ApiLesson> }>('/lessons', {
        params: { courseId, limit: '200', sort: 'no', order: 'asc' },
      })
      .then((r) => r.data.data),

  getLesson: (id: string) =>
    api.get<{ data: ApiLesson }>(`/lessons/${id}`).then((r) => r.data.data),

  createLesson: (body: CreateLessonBody) =>
    api.post<{ data: ApiLesson }>('/lessons', body).then((r) => r.data.data),

  updateLesson: (id: string, body: UpdateLessonBody) =>
    api.patch<{ data: ApiLesson }>(`/lessons/${id}`, body).then((r) => r.data.data),
}
