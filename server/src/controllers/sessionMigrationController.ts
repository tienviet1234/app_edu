import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, badRequest } from '../utils/response.js'
import { previewSessionMigration, runSessionMigration } from '../services/sessionMigrationService.js'

/** GET /api/admin/session-migration/preview — xem trước (KHÔNG ghi gì) có bao
 *  nhiêu buổi học "chung" (dữ liệu cũ trước khi app chuyển sang buổi riêng
 *  từng học sinh) sẽ được chuyển, nếu chạy migration thật. An toàn tuyệt đối,
 *  gọi bao nhiêu lần cũng được. */
export const previewSessionMigrationHandler = asyncHandler(async (req: Request, res: Response) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
  const summaries = await previewSessionMigration(classId)
  ok(res, { summaries })
})

/** POST /api/admin/session-migration/run — chạy migration THẬT. Yêu cầu
 *  body.confirm === true (chặn bấm nhầm/gọi nhầm) — đây là thao tác ghi dữ
 *  liệu thật, chỉ chạy 1 lần (có Migration marker chặn chạy trùng, trừ khi
 *  force=true). KHÔNG xóa dữ liệu gốc, chỉ tạo thêm + đánh dấu migratedAt. */
export const runSessionMigrationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.body?.confirm !== true) {
    badRequest(res, 'Cần xác nhận confirm=true để chạy migration thật.')
    return
  }
  const classId = typeof req.body?.classId === 'string' ? req.body.classId : undefined
  const force = req.body?.force === true
  const result = await runSessionMigration({ classId, force })
  ok(res, result)
})
