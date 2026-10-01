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

/** `limit` tăng dần khi bấm "Xem thêm" ở màn Thông báo (xem NotificationsPage)
 *  — tối đa 100 (giới hạn cứng ở backend paginate()), đủ dùng để tra lại
 *  "mấy ngày trước hệ thống đã báo gì" thay vì chỉ cố định 20 cái gần nhất
 *  như trước (lúc đó nhìn như trống vì không xem được quá khứ). Chuông 🔔
 *  vẫn dùng mặc định 20 (chỉ cần xem nhanh gần đây), chỉ màn Thông báo mới
 *  cần xem sâu hơn. */
export function useNotifications(limit = 20) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: [...NOTIF_KEYS.list, limit],
    queryFn: () => notificationService.list({ limit: String(limit), sort: '-createdAt' }),
    enabled: !!user,
    staleTime: 15_000,
    // Chuông/trang Thông báo tự làm mới định kỳ — trước đây chỉ unread-count
    // tự cập nhật, còn DANH SÁCH phải F5 mới thấy cái mới, dễ tưởng "không
    // thấy gì" dù thật ra chỉ là chưa tải lại.
    refetchInterval: 60_000,
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
