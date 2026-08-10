import { api } from '@/utils/api'

interface PagedData<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export interface ApiUser {
  _id: string
  name: string
  email: string
  role: 'admin' | 'teacher' | 'student' | 'parent'
  isActive: boolean
  phone?: string
  createdAt: string
}

export interface AnalyticsOverview {
  totals: {
    courses: number
    teachers: number
    students: number
    parents: number
    sessions: number
    reports: number
  }
  attendance: Array<{ status: string; count: number }>
}

export interface InviteToken {
  _id: string
  code: string
  role: 'teacher'
  note?: string
  createdBy?: { _id: string; name: string; email: string } | string
  usedBy?: { _id: string; name: string; email: string } | string
  usedAt?: string
  expiresAt: string
  isRevoked: boolean
  createdAt: string
  status: 'active' | 'used' | 'expired' | 'revoked'
}

export interface AuditLogActor {
  _id: string
  name: string
  role: string
  email: string
}

export interface AuditLog {
  _id: string
  actorId?: AuditLogActor | string
  actorRole?: string
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ApiCourse {
  _id: string
  name: string
  code?: string
  level: 'primary' | 'secondary'
  totalSessions?: number
  status: 'active' | 'archived' | 'draft'
  createdAt: string
}

export interface AttendanceTrendRow {
  session: number
  label: string
  date: string | null
  present: number
  late: number
  excused: number
  absent: number
  total: number
  attendRate: number
  avgScore: number | null
}

export interface HeatmapData {
  sessions: Array<{ _id: string; no: number; label: string; date: string }>
  students: Array<{ _id: string; name: string }>
  cells: Record<string, Record<string, number | null>>
}

export interface TeacherPerfRow {
  teacher: { _id: string; name: string; email: string }
  classCount: number
  avgScore: number | null
  scoreCount: number
  reportCount: number
}

export const adminService = {
  getOverview: () =>
    api.get<{ data: AnalyticsOverview }>('/analytics/overview').then((r) => r.data.data),

  listUsers: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiUser> }>('/users', { params })
      .then((r) => r.data.data),

  updateUser: (id: string, body: { role?: string; isActive?: boolean; name?: string }) =>
    api.patch<{ data: ApiUser }>(`/users/${id}`, body).then((r) => r.data.data),

  listAuditLogs: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<AuditLog> }>('/audit-logs', { params })
      .then((r) => r.data.data),

  listCourses: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiCourse> }>('/courses', { params })
      .then((r) => r.data.data),

  createCourse: (body: { name: string; code?: string; level: string; totalSessions?: number }) =>
    api.post<{ data: ApiCourse }>('/courses', body).then((r) => r.data.data),

  updateCourse: (id: string, body: Partial<ApiCourse>) =>
    api.patch<{ data: ApiCourse }>(`/courses/${id}`, body).then((r) => r.data.data),

  getAttendanceTrend: (params?: Record<string, string>) =>
    api
      .get<{ data: AttendanceTrendRow[] }>('/analytics/attendance-trend', { params })
      .then((r) => r.data.data),

  getScoreHeatmap: (classId: string) =>
    api
      .get<{ data: HeatmapData }>('/analytics/score-heatmap', { params: { classId } })
      .then((r) => r.data.data),

  getTeacherPerformance: () =>
    api
      .get<{ data: TeacherPerfRow[] }>('/analytics/teacher-performance')
      .then((r) => r.data.data),

  createInvite: (body: { note?: string; expireDays?: number }) =>
    api.post<{ data: InviteToken }>('/invites', body).then((r) => r.data.data),

  listInvites: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<InviteToken> }>('/invites', { params })
      .then((r) => r.data.data),

  revokeInvite: (id: string) =>
    api.delete<{ data: { revoked: boolean } }>(`/invites/${id}`).then((r) => r.data.data),
}
