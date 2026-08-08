import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { classService } from '@/services/classes'

export const CLASS_KEYS = {
  all: ['classes'] as const,
  list: (params?: Record<string, string>) => ['classes', 'list', params ?? {}] as const,
  detail: (id: string) => ['classes', id] as const,
}

export function useClasses(params?: Record<string, string>) {
  return useQuery({
    queryKey: CLASS_KEYS.list(params),
    queryFn: () => classService.list(params),
  })
}

export function useClassDetail(id: string) {
  return useQuery({
    queryKey: CLASS_KEYS.detail(id),
    queryFn: () => classService.get(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

export function useCreateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: classService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: CLASS_KEYS.all }),
  })
}
