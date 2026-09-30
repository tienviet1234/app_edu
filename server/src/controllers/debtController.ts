import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Debt } from '../models/Debt.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'
import { ParentProfile } from '../models/ParentProfile.js'
import { Notification } from '../models/Notification.js'
import { sendPushToUser } from '../services/pushService.js'
import { ok, created, badRequest, forbidden, notFound } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

/** Giáo viên chỉ được ghi/xem/xác nhận nợ của lớp MÌNH dạy — cùng kiểm tra
 *  với submissionController.assertTeacherOwnsClass. Admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  return !!cls?.teacherId && String(cls.teacherId) === String(authReq.userId)
}

/** Phụ huynh/học sinh chỉ được xem/trả nợ của CHÍNH học sinh đó (con mình,
 *  hoặc chính mình). Teacher/admin không bị giới hạn. */
async function assertCanAccessStudent(authReq: AuthRequest, studentId: string): Promise<boolean> {
  const role = authReq.user?.role
  if (role === 'admin' || role === 'teacher') return true
  if (role === 'student') return String(authReq.userId) === String(studentId)
  if (role === 'parent') {
    const parent = await User.findById(authReq.userId, 'childIds').lean()
    return (parent?.childIds ?? []).some((id) => String(id) === String(studentId))
  }
  return false
}

/** Báo cho học sinh + phụ huynh liên kết biết vừa có nợ mới — cùng mẫu với
 *  reminderService.sendRemindersFor (notification + push, không chặn request
 *  chính nếu lỗi). */
async function notifyNewDebt(studentId: string, classId: string, title: string, body: string): Promise<void> {
  try {
    const [cls, parents] = await Promise.all([
      Class.findById(classId, 'centerId').lean(),
      ParentProfile.find({ studentIds: studentId }).select('userId').lean(),
    ])
    const recipientIds = new Set<string>([String(studentId), ...parents.map((p) => String(p.userId))])
    const docs = [...recipientIds].map((uid) => ({
      centerId: cls?.centerId, recipientId: uid, title, body, type: 'announcement' as const,
      data: { kind: 'debt-created' },
    }))
    await Notification.insertMany(docs)
    recipientIds.forEach((uid) => void sendPushToUser(uid, { title, body, tag: 'debt-created', url: '/app' }))
  } catch (err) {
    console.error('Lỗi gửi thông báo nợ bài tập:', err)
  }
}

/** POST /api/debts — giáo viên ghi nợ cho 1 học sinh cụ thể. */
export const createDebt = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { classId, studentId, kind, label } = req.body ?? {}
  if (!classId || !studentId || !label || typeof label !== 'string' || !label.trim()) {
    badRequest(res, 'Thiếu lớp, học sinh hoặc mô tả nợ.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  const debt = await Debt.create({
    classId, studentId, createdBy: authReq.userId,
    kind: ['btvn', 'chep_phat', 'vocab', 'other'].includes(kind) ? kind : 'other',
    label: label.trim().slice(0, 300),
  })
  await notifyNewDebt(studentId, classId, '📌 Con vừa có 1 khoản nợ bài tập mới', debt.label)
  created(res, debt)
})

/** GET /api/debts?classId=&studentId=&status= */
export const listDebts = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const role = authReq.user?.role
  const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : ''
  const status = typeof req.query.status === 'string' ? req.query.status : ''

  const filter: Record<string, unknown> = {}
  if (role === 'teacher' || role === 'admin') {
    if (!classId) { badRequest(res, 'Thiếu classId.'); return }
    if (!(await assertTeacherOwnsClass(authReq, classId))) {
      forbidden(res, 'Bạn không dạy lớp này.')
      return
    }
    filter.classId = classId
    if (studentId) filter.studentId = studentId
  } else {
    if (!studentId || !(await assertCanAccessStudent(authReq, studentId))) {
      forbidden(res, 'Bạn chỉ có thể xem nợ bài tập của chính mình/con mình.')
      return
    }
    filter.studentId = studentId
    if (classId) filter.classId = classId
  }
  if (status) filter.status = status

  const debts = await Debt.find(filter).sort({ createdAt: -1 }).lean()
  ok(res, debts)
})

/** POST /api/debts/:id/submit — học sinh/phụ huynh trả nợ bằng cách gõ nội
 *  dung (VD list từ vựng: nghĩa). KHÔNG tự động chấm đúng/sai — chỉ chuyển
 *  sang trạng thái "đã nộp", chờ giáo viên xem qua xác nhận. */
export const submitDebt = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { answerText } = req.body ?? {}
  if (!answerText || typeof answerText !== 'string' || !answerText.trim()) {
    badRequest(res, 'Chưa gõ nội dung trả nợ.')
    return
  }
  const debt = await Debt.findById(req.params.id)
  if (!debt) { notFound(res, 'Không tìm thấy khoản nợ này.'); return }
  if (!(await assertCanAccessStudent(authReq, String(debt.studentId)))) {
    forbidden(res, 'Bạn chỉ có thể trả nợ của chính mình/con mình.')
    return
  }
  if (debt.status === 'cleared') {
    badRequest(res, 'Khoản nợ này đã được xác nhận xong, không cần nộp lại.')
    return
  }
  debt.answerText = answerText.trim().slice(0, 4000)
  debt.submittedAt = new Date()
  debt.submittedBy = new Types.ObjectId(authReq.userId)
  debt.status = 'submitted'
  await debt.save()
  ok(res, debt)
})

/** PUT /api/debts/:id/clear — giáo viên xem qua, xác nhận đã trả xong nợ
 *  (không cần học sinh nộp trước — giáo viên có thể tự xác nhận nếu đã kiểm
 *  tra trực tiếp). */
export const clearDebt = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const debt = await Debt.findById(req.params.id)
  if (!debt) { notFound(res, 'Không tìm thấy khoản nợ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(debt.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  debt.status = 'cleared'
  debt.clearedAt = new Date()
  debt.clearedBy = new Types.ObjectId(authReq.userId)
  await debt.save()
  ok(res, debt)
})

/** PUT /api/debts/:id/reject — giáo viên thấy bài nộp trả nợ chưa đạt, trả
 *  lại về "chưa xong" để học sinh làm lại (giữ nguyên nội dung đã gõ để đối
 *  chiếu, chỉ đổi trạng thái). */
export const rejectDebt = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const debt = await Debt.findById(req.params.id)
  if (!debt) { notFound(res, 'Không tìm thấy khoản nợ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(debt.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  debt.status = 'pending'
  await debt.save()
  ok(res, debt)
})

/** DELETE /api/debts/:id — xoá khoản nợ ghi nhầm. */
export const deleteDebt = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const debt = await Debt.findById(req.params.id)
  if (!debt) { notFound(res, 'Không tìm thấy khoản nợ này.'); return }
  if (!(await assertTeacherOwnsClass(authReq, String(debt.classId)))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }
  await debt.deleteOne()
  res.status(204).end()
})
