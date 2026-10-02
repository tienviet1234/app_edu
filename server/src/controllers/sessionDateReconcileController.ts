import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, badRequest } from '../utils/response.js'
import { previewDateSplits, runDateSplitsFix } from '../services/sessionDateReconcileService.js'

/** GET /api/admin/session-date-reconcile/preview — xem trước (KHÔNG ghi gì)
 *  các "buổi N" bị tách ra 2+ ngày gần nhau khác nhau giữa các học sinh trong
 *  cùng 1 lớp — thường do giáo viên chấm nối sang hôm sau cho vài em còn sót
 *  của cùng 1 buổi dạy thật. */
export const previewDateSplitsHandler = asyncHandler(async (req: Request, res: Response) => {
  const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined
  const summaries = await previewDateSplits({ classId })
  ok(res, { summaries })
})

/** POST /api/admin/session-date-reconcile/run — gộp thật về đúng ngày gợi ý.
 *  Yêu cầu body.confirm === true. Có thể truyền classId+lessonNo để chỉ sửa
 *  ĐÚNG 1 dòng (sửa từng cái) hoặc bỏ trống để sửa TẤT CẢ (sửa hàng loạt). */
export const runDateSplitsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.body?.confirm !== true) {
    badRequest(res, 'Cần xác nhận confirm=true để sửa thật.')
    return
  }
  const classId = typeof req.body?.classId === 'string' ? req.body.classId : undefined
  const lessonNo = typeof req.body?.lessonNo === 'number' ? req.body.lessonNo : undefined
  const result = await runDateSplitsFix({ classId, lessonNo })
  ok(res, result)
})
