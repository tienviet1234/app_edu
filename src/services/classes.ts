import { api } from '@/utils/api'
import type { ExtraComp } from '@/types'

export interface ApiClass {
  _id: string
  centerId?: string
  branchId?: string
  courseId?: string
  teacherId?: string
  teacherName?: string
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
  // Admin tùy chỉnh tiêu chí chấm điểm (RubricEditor) — lưu server-side, xem
  // ghi chú ở server/src/models/Class.ts
  hiddenComps?: string[]
  extraComps?: ExtraComp[]
  compOverrides?: Record<string, Record<string, number>>
  compLabelOverrides?: Record<string, Record<string, string>>
  // Đơn giá tính học phí/lương — xem AdminBillingPage.tsx + ghi chú ở
  // server/src/models/Class.ts. Chỉ admin sửa được (qua endpoint update).
  tuitionPerSession?: number
  teacherPayPerSession?: number
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

  /** Gỡ 1 học sinh khỏi lớp trên server — bắt buộc gọi khi xóa học sinh đã
   *  đồng bộ (isMongoid), nếu không lần đồng bộ sau sẽ "hồi sinh" lại học
   *  sinh đó vì server vẫn còn trong Class.studentIds. */
  removeStudent: (classId: string, studentId: string) =>
    api.delete<{ data: ApiClass }>(`/classes/${classId}/students/${studentId}`).then((r) => r.data.data),

  /** Student joins a class by entering the teacher's 6-char join code */
  join: (joinCode: string) =>
    api
      .post<{ data: { classId: string; className: string; alreadyEnrolled: boolean } }>('/classes/join', { joinCode })
      .then((r) => r.data.data),

  /** Returns the list of enrolled students (name + email) for a class */
  getStudents: (classId: string) =>
    api
      .get<{ data: Array<{ _id: string; name: string; email: string; role: string; avatar?: string }> }>(
        `/classes/${classId}/students`,
      )
      .then((r) => r.data.data),

  /** Returns the join code for a class (teacher only) */
  getJoinCode: (classId: string) =>
    api
      .get<{ data: { joinCode: string; className: string } }>(`/classes/${classId}/join-code`)
      .then((r) => r.data.data),

  /** Teacher adds students by name — creates managed accounts + enrolls in one call.
   *  Server hashes 1 password per student sequentially — can be slow for larger
   *  batches, especially after a Render cold start — so use a longer timeout
   *  than the default. */
  addManagedStudents: (classId: string, names: string[]) =>
    api
      .post<{ data: Array<{ _id: string; name: string }> }>(
        `/classes/${classId}/students/bulk`, { names }, { timeout: 90_000 },
      )
      .then((r) => r.data.data),

  /** Permanently deletes a class (teacher or admin) */
  delete: (id: string) =>
    api.delete<{ data: { deleted: boolean } }>(`/classes/${id}`).then((r) => r.data.data),
}
