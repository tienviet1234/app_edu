import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Class } from '../models/Class.js'
import { badRequest, created, forbidden, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'
import { User } from '../models/User.js'

export async function listClasses(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const teacherFilter = authReq.user?.role === 'teacher' ? { teacherId: authReq.userId } : {}
  const studentFilter = authReq.user?.role === 'student' ? { studentIds: authReq.userId } : {}

  const filter = {
    ...teacherFilter,
    ...studentFilter,
    ...(req.query.centerId ? { centerId: req.query.centerId } : {}),
    ...(req.query.branchId ? { branchId: req.query.branchId } : {}),
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  }
  ok(res, await paginate(Class, filter, req.query))
}

export async function createClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const userId = new Types.ObjectId(authReq.userId)
  const cls = await Class.create({
    ...req.body,
    // Auto-assign teacher to current user if not provided
    teacherId: req.body.teacherId ? new Types.ObjectId(req.body.teacherId) : userId,
    createdBy: userId,
  })
  await writeAudit(req, { action: 'class.create', resource: 'Class', resourceId: String(cls._id) })
  created(res, cls)
}

export async function getClass(req: Request, res: Response): Promise<void> {
  const cls = await Class.findById(req.params.id)
    .populate('teacherId', 'name email')
    .populate('studentIds', 'name email')
    .populate('courseId', 'name level')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  ok(res, cls)
}

export async function updateClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const cls = await Class.findById(req.params.id, 'teacherId')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  if (authReq.user?.role !== 'admin' && !cls.teacherId?.equals(authReq.userId!)) {
    forbidden(res, 'You can only update your own classes.')
    return
  }
  const updated = await Class.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  await writeAudit(req, { action: 'class.update', resource: 'Class', resourceId: String(cls._id) })
  ok(res, updated)
}

export async function enrollStudents(req: Request, res: Response): Promise<void> {
  const { studentIds } = req.body as { studentIds: string[] }
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    badRequest(res, 'studentIds array is required.')
    return
  }
  const cls = await Class.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { studentIds: { $each: studentIds.map((id) => new Types.ObjectId(id)) } } },
    { new: true },
  )
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  await writeAudit(req, { action: 'class.enroll', resource: 'Class', resourceId: String(cls._id) })
  ok(res, cls)
}

export async function removeStudent(req: Request, res: Response): Promise<void> {
  const cls = await Class.findByIdAndUpdate(
    req.params.id,
    { $pull: { studentIds: new Types.ObjectId(String(req.params.studentId)) } },
    { new: true },
  )
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  await writeAudit(req, { action: 'class.unenroll', resource: 'Class', resourceId: String(cls._id) })
  ok(res, cls)
}

/** POST /api/classes/join — student joins a class using its 6-char join code */
export async function joinClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { joinCode } = req.body as { joinCode: string }

  const cls = await Class.findOne({ joinCode: joinCode.toUpperCase().trim() })
  if (!cls) {
    notFound(res, 'Không tìm thấy lớp học. Kiểm tra lại mã lớp.')
    return
  }

  const studentId = new Types.ObjectId(authReq.userId)

  // Already enrolled — idempotent
  const alreadyIn = cls.studentIds.some((id) => id.equals(studentId))
  if (alreadyIn) {
    ok(res, { classId: String(cls._id), className: cls.name, alreadyEnrolled: true })
    return
  }

  await Class.findByIdAndUpdate(cls._id, { $addToSet: { studentIds: studentId } })
  await writeAudit(req, { action: 'class.join', resource: 'Class', resourceId: String(cls._id) })
  ok(res, { classId: String(cls._id), className: cls.name, alreadyEnrolled: false })
}

/** GET /api/classes/:id/students — list enrolled students with name + email */
export async function getClassStudents(req: Request, res: Response): Promise<void> {
  const cls = await Class.findById(req.params.id, 'studentIds').populate('studentIds', 'name email role')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  ok(res, cls.studentIds)
}

/** GET /api/classes/:id/join-code — teacher retrieves the join code for their class */
export async function getJoinCode(req: Request, res: Response): Promise<void> {
  const cls = await Class.findById(req.params.id, 'joinCode name teacherId')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  ok(res, { joinCode: cls.joinCode, className: cls.name })
}
