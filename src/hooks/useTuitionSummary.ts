import { useQuery } from '@tanstack/react-query'
import { tuitionNoticeService } from '@/services/tuitionNotices'
import { useAuthStore } from '@/store/authStore'

/** Số khoản "đang nợ học phí" trên tất cả lớp — dùng để hiện chấm nhắc
 *  (animate-pulse) cạnh tab "Báo cáo + Học phí" ở Sidebar/BottomNav. Chỉ
 *  giáo viên/admin mới có khoản học phí để theo dõi. */
export function useTuitionUnpaidCount() {
  const user = useAuthStore((s) => s.user)
  const enabled = user?.role === 'teacher' || user?.role === 'admin'
  return useQuery({
    queryKey: ['tuition-notices', 'unpaid-summary'],
    queryFn: () => tuitionNoticeService.getSummary(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}
