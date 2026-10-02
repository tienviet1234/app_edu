import { api } from '@/utils/api'

export interface ClassMigrationSummary {
  classId: string
  className: string
  sharedSessionsFound: number
  newDocsCreated: number
  scoresRepointed: number
  attendanceRepointed: number
}

export interface RunMigrationResult {
  alreadyRan: boolean
  ranAt?: string
  summaries: ClassMigrationSummary[]
  backup?: { sessions: unknown[]; scores: unknown[]; attendance: unknown[] }
}

export const sessionMigrationService = {
  /** Xem trước — KHÔNG ghi gì, an toàn gọi nhiều lần. */
  preview: (): Promise<{ summaries: ClassMigrationSummary[] }> =>
    api.get('/admin/session-migration/preview').then((r) => r.data.data),

  /** Chạy thật — ghi dữ liệu thật, chỉ 1 lần (có marker chặn chạy trùng). */
  run: (): Promise<RunMigrationResult> =>
    api.post('/admin/session-migration/run', { confirm: true }).then((r) => r.data.data),
}
