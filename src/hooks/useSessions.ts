import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionService } from '@/services/sessions'

export const SESSION_KEYS = {
  byClass: (classId: string) => ['sessions', classId] as const,
}

export function useSessions(classId: string) {
  return useQuery({
    queryKey: SESSION_KEYS.byClass(classId),
    // Server giới hạn tối đa 100 dòng/trang (mặc định chỉ 20) — nếu chỉ lấy trang
    // đầu, lớp nhiều học sinh sẽ mất các buổi cũ trên máy chưa từng mở lớp này.
    queryFn: async () => {
      const items: Awaited<ReturnType<typeof sessionService.list>>['items'] = []
      let total = 0
      for (let page = 1; page <= 100; page++) {
        const r = await sessionService.list({ classId, limit: '100', page: String(page) })
        items.push(...r.items)
        total = r.total
        if (!r.items.length || items.length >= total) break
      }
      return { items, total, page: 1, totalPages: 1 }
    },
    enabled: !!classId,
  })
}

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sessionService.create,
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: SESSION_KEYS.byClass(vars.classId) }),
  })
}
