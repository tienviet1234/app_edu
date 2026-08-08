import { useMutation, useQueryClient } from '@tanstack/react-query'
import { scoreService } from '@/services/scores'

export function useUpsertScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scoreService.upsert,
    onSuccess: (data) =>
      qc.invalidateQueries({ queryKey: ['scores', data.sessionId] }),
  })
}
