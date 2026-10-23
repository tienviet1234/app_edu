import type { Request, Response } from 'express'
import mongoose, { Types } from 'mongoose'
import { TuitionNotice } from '../models/TuitionNotice.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { checkNoticeSessions } from '../utils/dataRules.js'
import { writeRejectedAudit } from '../services/auditService.js'
import { ok, created, badRequest, forbidden, notFound } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'
import { isClassTeacher, teacherScopeFilter } from '../utils/classAuth.js'

/** Giáo viên chỉ được ghi/xem/xóa hồ sơ học phí của lớp MÌNH dạy — cùng kiểm
 *  tra với submissionController.assertTeacherOwnsClass. Admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId assistantTeacherIds').lean()
  return isClassTeacher(cls, authReq.userId!)
}

/** POST /api/tuition-notices — giáo viên đánh dấu ĐÃ GỬI báo cáo+học phí cho
 *  1 học sinh ở 1 kỳ cụ thể. Đây là HỒ SƠ TIỀN BẠC — không có endpoint sửa,
 *  ghi nhầm thì xóa làm lại (DELETE bên dưới). */
export const createTuitionNotice = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const {
    classId, studentId, periodFrom, periodTo, periodLabel,
    sessionsBilled, ratePerSession, computedAmount, finalAmount, adjustmentReason, reportComment,
    studentAdjustment, baseAmount,
  } = req.body ?? {}

  if (!classId || !studentId || periodFrom == null || periodTo == null || !periodLabel) {
    badRequest(res, 'Thiếu thông tin lớp/học sinh/kỳ báo cáo.')
    return
  }
  if (
    [sessionsBilled, ratePerSession, computedAmount, finalAmount].some(
      (v) => typeof v !== 'number' || Number.isNaN(v) || v < 0,
    )
  ) {
    badRequest(res, 'Số buổi/đơn giá/số tiền không hợp lệ.')
    return
  }
  // Số tiền thực gửi khác số tự tính (giảm giá, học bù...) BẮT BUỘC phải ghi
  // rõ lý do — tránh sửa tùy tiện không có căn cứ đối chiếu sau này.
  if (finalAmount !== computedAmount && !(typeof adjustmentReason === 'string' && adjustmentReason.trim())) {
    badRequest(res, 'Số tiền gửi khác số tự tính — phải ghi rõ lý do điều chỉnh.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }

  const fields = {
    classId, studentId, periodFrom, periodTo, periodLabel,
    sessionsBilled, ratePerSession, computedAmount, finalAmount,
    adjustmentReason: adjustmentReason?.trim() || undefined,
    reportComment: typeof reportComment === 'string' ? reportComment.slice(0, 5000) : '',
    studentAdjustment: typeof studentAdjustment === 'string' && studentAdjustment.trim() ? studentAdjustment.trim().slice(0, 300) : undefined,
    baseAmount: typeof baseAmount === 'number' && Number.isFinite(baseAmount) && baseAmount >= 0 ? baseAmount : undefined,
    sentAt: new Date(),
    sentBy: authReq.userId,
  }
  const { sessionIds } = req.body ?? {}

  try {
    if (sessionIds === undefined) {
      // Máy chưa cập nhật bản mới — giữ cách cũ (máy tự đánh dấu từng buổi).
      created(res, await TuitionNotice.create(fields))
      return
    }
    if (!Array.isArray(sessionIds) || !sessionIds.length || sessionIds.length > 100 || !sessionIds.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id))) {
      badRequest(res, 'Danh sách buổi của phiếu không hợp lệ.')
      return
    }
    const ids = [...new Set(sessionIds as string[])]
    // Tạo phiếu + đánh dấu "đã thu" đúng các buổi đó TRONG 1 GIAO DỊCH: hoặc đủ
    // cả 2, hoặc không có gì. Trước đây máy tạo phiếu rồi tự đánh dấu từng buổi
    // — buổi còn nằm trên máy bị bỏ qua im lặng, kỳ sau thu lại.
    const s = await mongoose.startSession()
    let result: { notice: unknown; marked: number } | null = null
    let rejected: Exclude<ReturnType<typeof checkNoticeSessions>, { ok: true }> | null = null
    try {
      await s.withTransaction(async () => {
        rejected = null
        const sessions = await ClassSession.find({ _id: { $in: ids } }, 'studentId classId deletedAt').session(s).lean()
        const prior = await TuitionNotice.find({ studentId, sessionIds: { $in: ids } }, 'sessionIds').session(s).lean()
        const check = checkNoticeSessions({
          studentId: String(studentId), classId: String(classId), requested: ids, sessions,
          alreadyNoticed: prior.flatMap((p) => p.sessionIds ?? []),
        })
        if (!check.ok) { rejected = check; return }
        const [notice] = await TuitionNotice.create([{ ...fields, sessionIds: ids }], { session: s })
        const upd = await ClassSession.updateMany({ _id: { $in: ids } }, { $set: { billed: true } }, { session: s })
        result = { notice, marked: upd.matchedCount }
      })
    } finally {
      await s.endSession()
    }
    if (rejected) {
      const r = rejected as Exclude<ReturnType<typeof checkNoticeSessions>, { ok: true }>
      const msg = {
        NOT_FOUND: 'Có buổi trong kỳ này CHƯA lên server — đợi máy đồng bộ xong (hoặc mở lại trang) rồi gửi lại.',
        WRONG_STUDENT: 'Có buổi không thuộc học sinh/lớp này.',
        DELETED: 'Có buổi trong kỳ này đã bị xóa — tải lại trang rồi gửi lại.',
        ALREADY_BILLED: 'Có buổi trong kỳ này ĐÃ nằm trong 1 phiếu học phí khác — không gửi trùng.',
      }[r.code]
      writeRejectedAudit(req, 'tuitionNotice.create.rejected', 'TuitionNotice', { code: r.code, classId, studentId, periodLabel, sessionIds: r.sessionIds, finalAmount })
      res.status(409).json({ success: false, code: r.code, message: msg, data: { sessionIds: r.sessionIds } })
      return
    }
    const { notice, marked } = result!
    created(res, { ...(notice as { toObject(): Record<string, unknown> }).toObject(), markedSessionIds: ids, markedCount: marked })
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
      badRequest(res, 'Kỳ này của học sinh này đã được đánh dấu gửi rồi — không thể gửi trùng.')
      return
    }
    throw err
  }
})

/** GET /api/tuition-notices?classId= — lịch sử đã gửi của cả lớp. */
export const listTuitionNotices = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
  if (!classId) {
    badRequest(res, 'Thiếu classId.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  const notices = await TuitionNotice.find({ classId }).sort({ sentAt: -1 }).lean()
  ok(res, notices)
})

/** GET /api/tuition-notices/summary — đếm nhanh số khoản "đang nợ học phí"
 *  (đã gửi, chưa thu tiền) trên TẤT CẢ lớp giáo viên này dạy (admin: toàn bộ)
 *  — dùng để hiện chấm/badge nhắc ở menu, không cần giáo viên tự mở từng lớp
 *  mới biết có khoản nào đang chờ thu hay không. */
export const getTuitionNoticeSummary = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const filter: Record<string, unknown> = { paymentStatus: 'unpaid' }
  if (authReq.user?.role !== 'admin') {
    const ownClasses = await Class.find(teacherScopeFilter(authReq.userId!), '_id').lean()
    filter.classId = { $in: ownClasses.map((c) => c._id) }
  }
  const unpaidCount = await TuitionNotice.countDocuments(filter)
  ok(res, { unpaidCount })
})

/** PUT /api/tuition-notices/:id/paid — đánh dấu ĐÃ THU ĐƯỢC TIỀN cho đúng kỳ
 *  này — KHÁC "đã gửi" ở trên, ghi nhận lúc phụ huynh THỰC SỰ đóng (có thể
 *  trễ hơn lúc gửi thông báo rất nhiều, hoặc đóng dồn nhiều kỳ 1 lúc — mỗi
 *  kỳ là 1 bản ghi riêng nên đóng từng kỳ độc lập được). */
export const markTuitionPaid = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const notice = await TuitionNotice.findById(req.params.id)
  if (!notice) { notFound(res, 'Không tìm thấy hồ sơ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(notice.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  notice.paymentStatus = 'paid'
  notice.paidAt = new Date()
  notice.paidBy = new Types.ObjectId(authReq.userId)
  await notice.save()
  ok(res, notice)
})

/** PUT /api/tuition-notices/:id/unpaid — hoàn tác "đã đóng tiền" nếu lỡ bấm
 *  nhầm (VD đánh dấu nhầm học sinh, hoặc phụ huynh báo đóng nhưng thực ra
 *  chưa chuyển khoản). */
export const markTuitionUnpaid = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const notice = await TuitionNotice.findById(req.params.id)
  if (!notice) { notFound(res, 'Không tìm thấy hồ sơ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(notice.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  notice.paymentStatus = 'unpaid'
  notice.paidAt = undefined
  notice.paidBy = undefined
  await notice.save()
  ok(res, notice)
})

/** DELETE /api/tuition-notices/:id — xóa hồ sơ ghi NHẦM (VD đánh dấu sai học
 *  sinh), cho phép gửi/ghi lại từ đầu cho đúng kỳ đó. */
export const deleteTuitionNotice = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const notice = await TuitionNotice.findById(req.params.id)
  if (!notice) { notFound(res, 'Không tìm thấy hồ sơ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(notice.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  // Phiếu có danh sách buổi → gỡ dấu "đã thu" đúng các buổi đó cùng lúc xóa
  // phiếu. Trước đây xóa phiếu ghi nhầm mà buổi vẫn mang dấu "đã thu" → không
  // bao giờ được tính tiền lại. Phiếu cũ (không có danh sách) giữ như trước.
  const ids = notice.sessionIds ?? []
  if (!ids.length) {
    await notice.deleteOne()
    res.status(204).end()
    return
  }
  const s = await mongoose.startSession()
  try {
    await s.withTransaction(async () => {
      await TuitionNotice.deleteOne({ _id: notice._id }, { session: s })
      await ClassSession.updateMany({ _id: { $in: ids } }, { $set: { billed: false } }, { session: s })
    })
  } finally {
    await s.endSession()
  }
  res.status(204).end()
})
