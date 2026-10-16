import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import type { AuthRequest } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { ok, badRequest, forbidden } from '../utils/response.js'
import { User } from '../models/User.js'
import { Class } from '../models/Class.js'
import { previewStudentMerge, runStudentMerge, MergeValidationError } from '../services/studentMergeService.js'

/** Giáo viên chỉ thao tác trong lớp mình dạy (teacherId) — admin không giới
 *  hạn. Cùng nguyên tắc với classController (update/delete/enroll). */
async function assertCanTouchClass(req: AuthRequest, classId: string, res: Response): Promise<boolean> {
  if (req.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  if (!cls || !cls.teacherId?.equals(req.userId!)) {
    forbidden(res, 'Bạn chỉ thao tác được trên lớp mình dạy.')
    return false
  }
  return true
}

/** GET /api/admin/student-merges/search?q=&excludeId= — tìm học sinh theo
 *  tên/email trong TOÀN BỘ hệ thống, kèm lớp hiện tại (nếu có) để admin/
 *  giáo viên chọn đúng tài khoản đích. Giáo viên chỉ thấy học sinh đang ở
 *  lớp MÌNH dạy (không dò được học sinh lớp giáo viên khác). */
export const searchStudentsForMerge = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const excludeId = typeof req.query.excludeId === 'string' ? req.query.excludeId : undefined
  if (!q) {
    ok(res, { items: [] })
    return
  }

  const filter: Record<string, unknown> = {
    role: 'student',
    $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }],
  }
  if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) }

  const students = await User.find(filter, 'name email avatar').limit(20).lean()
  const studentIds = students.map((s) => s._id)

  const classFilter: Record<string, unknown> = { studentIds: { $in: studentIds } }
  if (authReq.user?.role !== 'admin') classFilter.teacherId = authReq.userId
  const classes = await Class.find(classFilter, 'name studentIds').lean()

  const classByStudent = new Map<string, { classId: string; className: string }>()
  for (const c of classes) {
    for (const sid of c.studentIds) {
      classByStudent.set(String(sid), { classId: String(c._id), className: c.name })
    }
  }

  // Giáo viên chỉ thấy học sinh đang ở lớp mình dạy — học sinh không nằm
  // trong classByStudent (lớp giáo viên khác, hoặc chưa ở lớp nào) bị ẩn.
  const items = students
    .map((s) => ({
      _id: String(s._id),
      name: s.name,
      email: s.email,
      avatar: s.avatar,
      currentClass: classByStudent.get(String(s._id)) ?? null,
    }))
    .filter((s) => authReq.user?.role === 'admin' || s.currentClass)

  ok(res, { items })
})

/** GET /api/admin/student-merges/preview — xem trước (KHÔNG ghi gì). */
export const previewStudentMergeHandler = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { oldStudentId, newStudentId, fromClassId, toClassId } = req.query
  if (
    typeof oldStudentId !== 'string' || typeof newStudentId !== 'string' ||
    typeof fromClassId !== 'string' || typeof toClassId !== 'string'
  ) {
    badRequest(res, 'Cần đủ oldStudentId, newStudentId, fromClassId, toClassId.')
    return
  }
  if (!(await assertCanTouchClass(authReq, fromClassId, res))) return
  if (!(await assertCanTouchClass(authReq, toClassId, res))) return

  try {
    const plan = await previewStudentMerge({ oldStudentId, newStudentId, fromClassId, toClassId })
    ok(res, { plan })
  } catch (err) {
    if (err instanceof MergeValidationError) {
      badRequest(res, err.message)
      return
    }
    throw err
  }
})

/** POST /api/admin/student-merges — chạy gộp THẬT. Yêu cầu body.confirm
 *  === true (chặn bấm/gọi nhầm) — thao tác ghi dữ liệu thật, đổi cả học phí
 *  đã thu của học sinh. */
export const runStudentMergeHandler = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { oldStudentId, newStudentId, fromClassId, toClassId, confirm } = req.body ?? {}
  if (confirm !== true) {
    badRequest(res, 'Cần xác nhận confirm=true để chạy gộp thật.')
    return
  }
  if (
    typeof oldStudentId !== 'string' || typeof newStudentId !== 'string' ||
    typeof fromClassId !== 'string' || typeof toClassId !== 'string'
  ) {
    badRequest(res, 'Cần đủ oldStudentId, newStudentId, fromClassId, toClassId.')
    return
  }
  if (!(await assertCanTouchClass(authReq, fromClassId, res))) return
  if (!(await assertCanTouchClass(authReq, toClassId, res))) return

  try {
    const result = await runStudentMerge(
      { oldStudentId, newStudentId, fromClassId, toClassId },
      { actorId: authReq.userId, actorRole: authReq.user?.role },
    )
    ok(res, result)
  } catch (err) {
    if (err instanceof MergeValidationError) {
      badRequest(res, err.message)
      return
    }
    throw err
  }
})
