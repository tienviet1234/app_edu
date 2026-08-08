import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionService } from '@/services/sessions'

export const SESSION_KEYS = {
  byClass: (classId: string) => ['sessions', classId] as const,
}

export function useSessions(classId: string) {
  return useQuery({
    queryKey: SESSION_KEYS.byClass(classId),
    queryFn: () => sessionService.list({ classId }),
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
