import type { Request, Response } from 'express'
import type { AuthRequest } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, badRequest, notFound } from '../utils/response.js'
import { saveClientSnapshot, listBackups, presignBackupKey, readSnapshotContent } from '../services/clientSnapshotService.js'
import { runDatabaseBackup } from '../services/backupService.js'
import { writeAudit } from '../services/auditService.js'

/** POST /api/client-snapshots — máy giáo viên/admin tự gửi bản chụp dữ liệu
 *  đang có trên máy (xem ClientSnapshot model). Body: { deviceId, data } với
 *  data là CHUỖI JSON nguyên văn từ localStorage (không parse lại ở client để
 *  giữ đúng 100% những gì đang có trên máy). */
export const postClientSnapshot = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { deviceId, data } = (req.body ?? {}) as { deviceId?: unknown; data?: unknown }
  if (typeof deviceId !== 'string' || !deviceId || deviceId.length > 80 || typeof data !== 'string' || !data) {
    badRequest(res, 'Cần deviceId và data (chuỗi JSON).')
    return
  }
  const result = await saveClientSnapshot({ userId: authReq.userId!, deviceId, userAgent: req.headers['user-agent'], raw: data })
  ok(res, result)
})

/** GET /api/admin/backups — bản sao lưu DB hằng ngày (R2) + bản chụp từ máy giáo viên. */
export const getBackups = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, await listBackups())
})

/** GET /api/admin/backups/download?key= — link tải (hết hạn 1 giờ). */
export const downloadBackup = asyncHandler(async (req: Request, res: Response) => {
  const key = typeof req.query.key === 'string' ? req.query.key : ''
  try {
    const url = await presignBackupKey(key)
    await writeAudit(req, { action: 'backup.download', resource: 'Backup', metadata: { key } })
    ok(res, { url })
  } catch {
    badRequest(res, 'Key không hợp lệ.')
  }
})

/** GET /api/admin/backups/snapshots/:id — nội dung 1 bản chụp máy giáo viên. */
export const getSnapshotContent = asyncHandler(async (req: Request, res: Response) => {
  const result = await readSnapshotContent(String(req.params.id))
  if (!result) {
    notFound(res, 'Không tìm thấy bản chụp.')
    return
  }
  await writeAudit(req, { action: 'backup.readSnapshot', resource: 'ClientSnapshot', resourceId: String(req.params.id) })
  ok(res, result)
})

/** POST /api/admin/backups/run — admin bấm sao lưu DB ngay (không đợi lịch 2h sáng). */
export const runBackupNow = asyncHandler(async (req: Request, res: Response) => {
  const result = await runDatabaseBackup()
  await writeAudit(req, { action: 'backup.runManual', resource: 'Backup', metadata: { key: result.key, documents: result.documents } })
  ok(res, result)
})
