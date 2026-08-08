import { api } from '@/utils/api'

export interface ApiClass {
  _id: string
  centerId?: string
  branchId?: string
  courseId?: string
  teacherId?: string
  assistantTeacherIds: string[]
  studentIds: string[]
  name: string
  academicYear?: string
  status: 'upcoming' | 'active' | 'completed' | 'cancelled'
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; room?: string }>
  startDate?: string
  endDate?: string
  maxStudents: number
  createdAt: string
  updatedAt: string
}

interface PagedData<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export const classService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiClass> }>('/classes', { params })
      .then((r) => r.data.data),

  create: (body: { name: string; teacherId?: string; status?: string; academicYear?: string }) =>
    api.post<{ data: ApiClass }>('/classes', body).then((r) => r.data.data),

  get: (id: string) =>
    api.get<{ data: ApiClass }>(`/classes/${id}`).then((r) => r.data.data),

  update: (id: string, body: Record<string, unknown>) =>
    api.patch<{ data: ApiClass }>(`/classes/${id}`, body).then((r) => r.data.data),

  enrollStudents: (id: string, studentIds: string[]) =>
    api.post<{ data: ApiClass }>(`/classes/${id}/enroll`, { studentIds }).then((r) => r.data.data),

  /** Student joins a class by entering the teacher's 6-char join code */
  join: (joinCode: string) =>
    api
      .post<{ data: { classId: string; className: string; alreadyEnrolled: boolean } }>('/classes/join', { joinCode })
      .then((r) => r.data.data),

  /** Returns the list of enrolled students (name + email) for a class */
  getStudents: (classId: string) =>
    api
      .get<{ data: Array<{ _id: string; name: string; email: string; role: string }> }>(
        `/classes/${classId}/students`,
      )
      .then((r) => r.data.data),

  /** Returns the join code for a class (teacher only) */
  getJoinCode: (classId: string) =>
    api
      .get<{ data: { joinCode: string; className: string } }>(`/classes/${classId}/join-code`)
      .then((r) => r.data.data),
}
