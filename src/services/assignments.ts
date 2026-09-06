import { api } from '@/utils/api'
import type { Question, QuestionSafe } from '@/types/quiz'

export type AssignmentSubmitType = 'photo' | 'video' | 'both' | 'quiz'

export interface Assignment {
  _id: string
  classId: string
  sessionId?: string
  createdBy: string
  title: string
  description?: string
  dueDate: string
  submitType: AssignmentSubmitType
  scriptText?: string
  maxPhotos: number
  questions?: Question[] | QuestionSafe[]  // full cho giáo viên, safe (ẩn đáp án) cho học sinh/phụ huynh
  isActive: boolean
  createdAt: string
}

export interface AssignmentStats {
  total: number
  reviewed: number
  pending: number
}

export const assignmentService = {
  list: (classId: string, sessionId?: string): Promise<Assignment[]> => {
    const params: Record<string, string> = { classId }
    if (sessionId) params.sessionId = sessionId
    return api.get('/assignments', { params }).then((r) => r.data.data)
  },

  get: (id: string): Promise<Assignment> =>
    api.get(`/assignments/${id}`).then((r) => r.data.data),

  stats: (id: string): Promise<AssignmentStats> =>
    api.get(`/assignments/${id}/stats`).then((r) => r.data.data),

  create: (data: {
    classId: string
    sessionId?: string
    title: string
    description?: string
    dueDate: string
    submitType: AssignmentSubmitType
    scriptText?: string
    maxPhotos?: number
    questions?: Question[]
  }): Promise<Assignment> =>
    api.post('/assignments', data).then((r) => r.data.data),

  update: (id: string, data: Partial<Assignment>): Promise<Assignment> =>
    api.put(`/assignments/${id}`, data).then((r) => r.data.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/assignments/${id}`).then(() => undefined),
}
