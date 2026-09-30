import { AiGradedPhoto } from '../models/AiGradedPhoto.js'
import { deleteImageFromCloudinary } from './storageService.js'

/** Dọn ảnh bài kiểm tra đã lưu quá hạn (30 ngày) — xóa cả trên Cloudinary
 *  LẪN document Mongo, best-effort (1 ảnh lỗi không chặn các ảnh khác).
 *  Gọi qua POST /api/cron/cleanup-ai-photos theo lịch, cùng cơ chế với
 *  backupService.runDatabaseBackup(). */
export async function runAiPhotoCleanup(): Promise<{ deleted: number }> {
  const expired = await AiGradedPhoto.find({ expiresAt: { $lte: new Date() } }, '_id photoPublicId').lean()
  for (const p of expired) {
    await deleteImageFromCloudinary(p.photoPublicId).catch(() => null)
  }
  if (expired.length) {
    await AiGradedPhoto.deleteMany({ _id: { $in: expired.map((p) => p._id) } })
  }
  return { deleted: expired.length }
}
