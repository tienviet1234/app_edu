import { useQuery } from '@tanstack/react-query'
import { classService } from '@/services/classes'

export interface ApiStudent {
  _id: string
  name: string
  email: string
  role: string
}

export const STUDENT_KEYS = {
  byClass: (classId: string) => ['class-students', classId] as const,
}

export function useClassStudents(classId: string) {
  return useQuery({
    queryKey: STUDENT_KEYS.byClass(classId),
    queryFn: () => classService.getStudents(classId),
    enabled: !!classId,
    staleTime: 60_000,
  })
}
