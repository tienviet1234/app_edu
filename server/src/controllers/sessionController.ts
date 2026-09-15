import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { Class } from '../models/Class.js'
import { Score } from '../models/Score.js'
import { Attendance } from '../models/Attendance.js'
import { created, forbidden, notFound, ok } from '../utils/response.js'
import { parsePagination } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

/** Giáo viên chỉ được xem/sửa/xóa buổi học của các lớp mình dạy — admin qua
 *  hết. Trước đây thiếu kiểm tra này, 1 giáo viên gọi thẳng API có thể
 *  sửa/xóa buổi (và cascade cả Score/Attendance) của lớp giáo viên khác. */
async function canManageSessionOfClass(authReq: AuthRequest, classId: Types.ObjectId | string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId')
  return !!cls?.teacherId?.equals(authReq.userId!)
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const filter: Record<string, unknown> = {
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    // Bản ghi buổi học CHUNG cũ, đã được fan-out sang per-student — ẩn mặc định
    // khỏi client (client chưa hiểu cấu trúc mới cho đến khi Phase 2 lên production).
    // ?includeMigrated=true để công cụ admin/debug xem lại bản gốc nếu cần.
    ...(req.query.includeMigrated === 'true' ? {} : { migratedAt: { $exists: false } }),
  }
  if (authReq.user?.role === 'teacher') {
    const ownClassIds = await Class.find({ teacherId: authReq.userId }, '_id').lean()
    filter.classId = { $in: ownClassIds.map((c) => c._id) }
  }
  // paginate() không hỗ trợ .populate() — populate createdBy thủ công để client
  // biết giáo viên nào đã ghi buổi này (dùng tính lương/học phí theo buổi).
  const { page, limit, skip, sort } = parsePagination(req.query)
  const [items, total] = await Promise.all([
    ClassSession.find(filter).sort(sort).skip(skip).limit(limit).populate('createdBy', 'name'),
    ClassSession.countDocuments(filter),
  ])
  ok(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}

export async function createSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const session = await ClassSession.create({
    ...req.body,
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
    createdBy: new Types.ObjectId(authReq.userId),
  })
  await session.populate('createdBy', 'name')
  await writeAudit(req, { action: 'session.create', resource: 'ClassSession', resourceId: String(session._id) })
  created(res, session)
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const session = await ClassSession.findById(req.params.id)
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  ok(res, session)
}

export async function updateSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await ClassSession.findById(req.params.id, 'classId')
  if (!existing) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, existing.classId))) {
    forbidden(res, 'You can only update sessions in your own classes.')
    return
  }
  const session = await ClassSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  await writeAudit(req, { action: 'session.update', resource: 'ClassSession', resourceId: String(session!._id) })
  ok(res, session)
}

/** DELETE /api/sessions/:id — xóa 1 buổi học riêng của học sinh (và điểm/điểm
 *  danh gắn với nó), dùng khi giáo viên tạo nhầm buổi hoặc muốn xóa hẳn. */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const session = await ClassSession.findById(req.params.id)
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, session.classId))) {
    forbidden(res, 'You can only delete sessions in your own classes.')
    return
  }
  await Promise.all([
    Score.deleteMany({ sessionId: session._id }),
    Attendance.deleteMany({ sessionId: session._id }),
  ])
  await session.deleteOne()
  await writeAudit(req, { action: 'session.delete', resource: 'ClassSession', resourceId: String(session._id) })
  ok(res, { deleted: true })
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await ClassSession.findById(req.params.id, 'classId')
  if (!existing) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, existing.classId))) {
    forbidden(res, 'You can only update sessions in your own classes.')
    return
  }
  const session = await ClassSession.findByIdAndUpdate(
    req.params.id,
    { status: 'completed' },
    { new: true },
  )
  await writeAudit(req, { action: 'session.complete', resource: 'ClassSession', resourceId: String(session!._id) })
  ok(res, session)
}
