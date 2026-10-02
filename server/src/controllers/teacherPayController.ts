import type { Request, Response } from 'express'
import { TeacherPayRecord } from '../models/TeacherPayRecord.js'
import { ok, created, badRequest, notFound } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

/** POST /api/teacher-pay — ADMIN đánh dấu ĐÃ TRẢ LƯƠNG cho 1 giáo viên ở 1
 *  khoảng ngày cụ thể (thường là đúng 1 tháng dương lịch, khớp mốc "đến hạn"
 *  cố định cuối tháng — xem billingReminderService). Route này CHỈ admin gọi
 *  được (authorize('admin') ở routes, không dùng authorize('teacher') vì
 *  rank hierarchy chỉ 1 chiều admin→teacher, không có chiều ngược lại). */
export const markTeacherPaid = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { teacherId, from, to, amount, note } = req.body ?? {}
  if (!teacherId || !from || !to || typeof amount !== 'number' || amount < 0) {
    badRequest(res, 'Thiếu giáo viên/khoảng ngày/số tiền hợp lệ.')
    return
  }
  try {
    const record = await TeacherPayRecord.create({
      teacherId, from, to, amount,
      note: typeof note === 'string' ? note.trim().slice(0, 500) || undefined : undefined,
      paidAt: new Date(),
      paidBy: authReq.userId,
    })
    created(res, record)
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
      badRequest(res, 'Khoảng ngày này của giáo viên đã được đánh dấu trả lương rồi.')
      return
    }
    throw err
  }
})

/** GET /api/teacher-pay?from=&to= — xem đã trả lương cho ai trong khoảng
 *  ngày này chưa (dùng ở trang Học phí & Lương để hiện trạng thái). */
export const listTeacherPay = asyncHandler(async (req: Request, res: Response) => {
  const from = typeof req.query.from === 'string' ? req.query.from : ''
  const to = typeof req.query.to === 'string' ? req.query.to : ''
  const filter: Record<string, string> = {}
  if (from) filter.from = from
  if (to) filter.to = to
  const records = await TeacherPayRecord.find(filter).sort({ paidAt: -1 }).lean()
  ok(res, records)
})

/** DELETE /api/teacher-pay/:id — hoàn tác đánh dấu nhầm. */
export const deleteTeacherPay = asyncHandler(async (req: Request, res: Response) => {
  const record = await TeacherPayRecord.findById(req.params.id)
  if (!record) { notFound(res, 'Không tìm thấy hồ sơ này.'); return }
  await record.deleteOne()
  res.status(204).end()
})
