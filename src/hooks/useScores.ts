import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scoreService } from '@/services/scores'

export const SCORE_KEYS = {
  byClass: (classId: string) => ['scores', 'class', classId] as const,
}

export function useClassScores(classId: string) {
  return useQuery({
    queryKey: SCORE_KEYS.byClass(classId),
    // Server tự cắt limit về tối đa 100 — phải lấy từng trang, nếu không điểm
    // ngoài 100 dòng đầu không về máy và buổi hiện trống trơn.
    queryFn: async () => {
      const items: Awaited<ReturnType<typeof scoreService.list>>['items'] = []
      let total = 0
      for (let page = 1; page <= 100; page++) {
        const r = await scoreService.list({ classId, limit: '100', page: String(page) })
        items.push(...r.items)
        total = r.total
        if (!r.items.length || items.length >= total) break
      }
      return { items, total }
    },
    enabled: !!classId,
  })
}

export function useUpsertScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scoreService.upsert,
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ['scores', data.sessionId] }),
  })
}
