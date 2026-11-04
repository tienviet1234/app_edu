import { api } from '@/utils/api'

export interface DbBackup { key: string; lastModified?: string }

export interface ClientSnapshotMeta {
  _id: string
  userId: { _id: string; name: string; email: string; role: string } | null
  deviceId: string
  userAgent?: string
  r2Key: string
  sizeBytes: number
  classCount: number
  sessionCount: number
  unsyncedSessionCount: number
  createdAt: string
}

export interface SnapshotDayVersion {
  studentId: string
  studentName: string
  session: Record<string, unknown>
  inOrphans: boolean
  sources: Array<{ deviceId: string; user: { _id: string; name: string; role: string } | null; firstAt: string; lastAt: string; copies: number }>
}

export interface SnapshotDayResult {
  scanned: number
  failed: number
  devices: number
  classMeta: Record<string, unknown> | null
  versions: SnapshotDayVersion[]
}

export const backupService = {
  /** Tìm buổi của 1 lớp + 1 ngày trong MỌI bản chụp còn giữ của mọi máy. */
  searchSnapshotSessions: (classId: string, date: string) =>
    api
      .get<{ data: SnapshotDayResult }>('/admin/backups/snapshot-sessions', { params: { classId, date }, timeout: 180_000 })
      .then((r) => r.data.data),

  /** Máy giáo viên/admin gửi bản chụp NGUYÊN VĂN dữ liệu đang có trên máy. */
  uploadSnapshot: (deviceId: string, data: string) =>
    api
      .post<{ data: { saved: boolean; id?: string } }>('/client-snapshots', { deviceId, data }, { timeout: 60_000 })
      .then((r) => r.data.data),

  list: () =>
    api
      .get<{ data: { dbBackups: DbBackup[]; snapshots: ClientSnapshotMeta[] } }>('/admin/backups')
      .then((r) => r.data.data),

  downloadUrl: (key: string) =>
    api.get<{ data: { url: string } }>('/admin/backups/download', { params: { key } }).then((r) => r.data.data.url),

  /** Nội dung 1 bản chụp máy giáo viên (AppData) — cho công cụ "Dữ liệu kẹt". */
  snapshotContent: (id: string) =>
    api
      .get<{ data: { meta: { userId: string; deviceId: string; createdAt: string }; data: unknown } }>(`/admin/backups/snapshots/${id}`, { timeout: 60_000 })
      .then((r) => r.data.data),

  runNow: () =>
    api
      .post<{ data: { key: string; collections: number; documents: number; sizeBytes: number } }>('/admin/backups/run', {}, { timeout: 120_000 })
      .then((r) => r.data.data),
}
