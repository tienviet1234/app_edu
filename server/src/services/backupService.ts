import mongoose from 'mongoose'
import { uploadBufferToR2, listR2Keys, deleteVideoFromR2 } from './storageService.js'

const BACKUP_PREFIX = 'backups/'
const RETENTION_COUNT = 30 // giữ 30 bản gần nhất (~1 tháng nếu chạy hàng ngày)

// Token đăng nhập/OTP là trạng thái phiên tạm thời (có hạn dùng riêng), không
// phải dữ liệu cần giữ lâu dài — mất đi chỉ buộc người dùng đăng nhập lại /
// xin OTP mới, không mất dữ liệu thật. Bỏ qua để backup gọn và giảm bề mặt
// rủi ro nếu file backup từng bị lộ.
const SKIP_COLLECTIONS = new Set(['refreshtokens', 'otptokens'])
// Field nhạy cảm cần loại khỏi bản dump dù đã hash 1 chiều — đọc trực tiếp
// qua native driver ở đây KHÔNG tôn trọng `select: false` của Mongoose
// (đó là cơ chế ở tầng Mongoose Query, không áp dụng khi gọi thẳng driver).
const SENSITIVE_FIELDS: Record<string, string[]> = {
  users: ['passwordHash'],
}

interface BackupResult {
  key: string
  collections: number
  documents: number
  sizeBytes: number
  deletedOld: number
}

/** Sao lưu toàn bộ collection trong MongoDB đang kết nối (server đã connect
 *  sẵn khi khởi động — không cần MONGO_URI riêng ở đây) thành 1 file JSON,
 *  đẩy lên Cloudflare R2 (cùng bucket với video, tiền tố "backups/"). Tự dọn
 *  bản cũ, chỉ giữ RETENTION_COUNT bản gần nhất để không phình bucket mãi. */
export async function runDatabaseBackup(): Promise<BackupResult> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database chưa kết nối.')

  const collections = (await db.listCollections().toArray()).filter((c) => !SKIP_COLLECTIONS.has(c.name))
  const dump: Record<string, unknown[]> = {}
  let totalDocs = 0

  for (const { name } of collections) {
    const projection = SENSITIVE_FIELDS[name]?.reduce((p, f) => ({ ...p, [f]: 0 }), {} as Record<string, number>)
    const docs = await db.collection(name).find({}, projection ? { projection } : undefined).toArray()
    dump[name] = docs
    totalDocs += docs.length
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const key = `${BACKUP_PREFIX}db-${timestamp}.json`
  const buffer = Buffer.from(JSON.stringify(dump))
  await uploadBufferToR2(buffer, key, 'application/json')

  // Dọn bản cũ vượt quá retention — sắp theo tên (chứa timestamp ISO nên sort
  // chuỗi = sort theo thời gian), xóa các bản cũ nhất ngoài RETENTION_COUNT.
  const existing = await listR2Keys(BACKUP_PREFIX)
  const sorted = existing.map((o) => o.key).sort() // cũ → mới
  const toDelete = sorted.slice(0, Math.max(0, sorted.length - RETENTION_COUNT))
  for (const oldKey of toDelete) {
    await deleteVideoFromR2(oldKey).catch(() => null) // best-effort, không chặn backup nếu xóa lỗi
  }

  return {
    key,
    collections: collections.length,
    documents: totalDocs,
    sizeBytes: buffer.byteLength,
    deletedOld: toDelete.length,
  }
}
