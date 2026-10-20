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

export const backupService = {
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

  runNow: () =>
    api
      .post<{ data: { key: string; collections: number; documents: number; sizeBytes: number } }>('/admin/backups/run', {}, { timeout: 120_000 })
      .then((r) => r.data.data),
}
