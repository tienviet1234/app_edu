import { api } from '@/utils/api'

export interface ApiNotification {
  _id: string
  title: string
  body: string
  type: string
  readAt?: string
  data?: Record<string, unknown>
  createdAt: string
}

export const notificationService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: { items: ApiNotification[]; total: number } }>('/notifications', { params })
      .then((r) => r.data.data),

  markRead: (id: string) =>
    api.post<{ data: ApiNotification }>(`/notifications/${id}/read`).then((r) => r.data.data),

  markAllRead: () =>
    api.post<{ data: { updated: number } }>('/notifications/read-all').then((r) => r.data.data),

  unreadCount: () =>
    api
      .get<{ data: { count: number } }>('/notifications/unread-count')
      .then((r) => r.data.data.count),

  broadcast: (body: { classId: string; title: string; body: string; type?: string }) =>
    api.post<{ data: { sent: number } }>('/notifications/broadcast', body).then((r) => r.data.data),
}
