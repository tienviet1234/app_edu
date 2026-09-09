import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scoreService } from '@/services/scores'

export const SCORE_KEYS = {
  byClass: (classId: string) => ['scores', 'class', classId] as const,
}

export function useClassScores(classId: string) {
  return useQuery({
    queryKey: SCORE_KEYS.byClass(classId),
    queryFn: () => scoreService.list({ classId, limit: '2000' }),
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
