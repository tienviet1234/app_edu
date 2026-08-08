import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationService } from '@/services/notifications'
import { useAuthStore } from '@/store/authStore'

export const NOTIF_KEYS = {
  list: ['notifications'] as const,
  unread: ['notifications', 'unread-count'] as const,
}

export function useUnreadCount() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: NOTIF_KEYS.unread,
    queryFn: notificationService.unreadCount,
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 20_000,
  })
}

export function useNotifications() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: NOTIF_KEYS.list,
    queryFn: () => notificationService.list({ limit: '20', sort: '-createdAt' }),
    enabled: !!user,
    staleTime: 15_000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationService.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEYS.list })
      qc.invalidateQueries({ queryKey: NOTIF_KEYS.unread })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIF_KEYS.list })
      qc.invalidateQueries({ queryKey: NOTIF_KEYS.unread })
    },
  })
}
