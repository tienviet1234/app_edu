import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { reportService, type UpsertReportBody } from '@/services/reports'

export const REPORT_KEYS = {
  list: (classId: string) => ['reports', classId] as const,
  student: (classId: string, studentId: string) => ['reports', classId, studentId] as const,
}

export function useUpsertReport(classId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertReportBody) => reportService.upsert(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORT_KEYS.list(classId) }),
  })
}

export function useStudentReports(classId: string, studentId: string) {
  return useQuery({
    queryKey: REPORT_KEYS.student(classId, studentId),
    queryFn: () =>
      reportService.list({ classId, studentId, limit: '10', page: '1' }),
    enabled: !!classId && !!studentId,
    staleTime: 2 * 60_000,
  })
}
