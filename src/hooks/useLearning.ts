import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { learningService, type CreateLessonBody, type UpdateLessonBody } from '@/services/learning'

export const LEARN_KEYS = {
  courses: ['courses'] as const,
  courseList: (params?: Record<string, string>) => ['courses', 'list', params ?? {}] as const,
  course: (id: string) => ['courses', id] as const,
  lessons: (courseId: string) => ['lessons', courseId] as const,
}

export function useCourses(params?: Record<string, string>) {
  return useQuery({
    queryKey: LEARN_KEYS.courseList(params),
    queryFn: () => learningService.listCourses(params),
    staleTime: 5 * 60_000,
  })
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: LEARN_KEYS.course(id),
    queryFn: () => learningService.getCourse(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })
}

export function useCourseLessons(courseId: string) {
  return useQuery({
    queryKey: LEARN_KEYS.lessons(courseId),
    queryFn: () => learningService.listLessons(courseId),
    enabled: !!courseId,
    staleTime: 5 * 60_000,
  })
}

export function useCreateLesson(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateLessonBody) => learningService.createLesson(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEARN_KEYS.lessons(courseId) }),
  })
}

export function useUpdateLesson(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLessonBody }) =>
      learningService.updateLesson(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEARN_KEYS.lessons(courseId) }),
  })
}
