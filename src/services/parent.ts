import { api } from '@/utils/api'

export interface ChildSession {
  total: number
  attendance: 'present' | 'late' | 'excused' | 'absent'
  date: string
}

export interface ChildClass {
  id: string
  name: string
  status: string
  teacher: string
  sessionCount: number
  presentCount: number
  avg: number | null
  recentSessions: ChildSession[]
}

export interface Child {
  id: string
  name: string
  email: string
  avatar?: string
  classes: ChildClass[]
}

export const parentService = {
  getChildren: () =>
    api.get<{ data: Child[] }>('/parents/me/children').then((r) => r.data.data),

  linkChild: (email: string) =>
    api
      .post<{ data: { id: string; name: string; email: string; avatar?: string } }>(
        '/parents/me/link-child',
        { email },
      )
      .then((r) => r.data.data),

  unlinkChild: (childId: string) =>
    api.delete(`/parents/me/unlink-child/${childId}`).then((r) => r.data),
}
