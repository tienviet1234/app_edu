import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import crypto from 'crypto'
import { Class } from '../models/Class.js'
import { badRequest, created, forbidden, notFound, ok } from '../utils/response.js'
import { parsePagination } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'
import { User } from '../models/User.js'
import { isClassTeacher, teacherScopeFilter } from '../utils/classAuth.js'
import { checkStudentTuitionInput } from '../utils/dataRules.js'

export async function listClasses(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const teacherFilter = authReq.user?.role === 'teacher' ? teacherScopeFilter(authReq.userId!) : {}
  const studentFilter = authReq.user?.role === 'student' ? { studentIds: authReq.userId } : {}

  const filter = {
    ...teacherFilter,
    ...studentFilter,
    ...(req.query.centerId ? { centerId: req.query.centerId } : {}),
    ...(req.query.branchId ? { branchId: req.query.branchId } : {}),
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  }
  const { page, limit, skip, sort } = parsePagination(req.query)
  const [items, total] = await Promise.all([
    Class.find(filter).sort(sort).skip(skip).limit(limit).populate('teacherId', 'name email').populate('assistantTeacherIds', 'name email').populate('studentIds', 'name'),
    Class.countDocuments(filter),
  ])
  ok(res, { items: items.map((c) => withoutPrivateTuition(authReq, c)), total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
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

/** Học phí riêng từng học sinh (giảm em này/tăng em kia) chỉ admin + giáo viên
 *  của lớp được thấy — học sinh/phụ huynh/giáo viên lớp khác không được thấy
 *  mức giảm của bé khác. */
function withoutPrivateTuition(authReq: AuthRequest, cls: InstanceType<typeof Class>): Record<string, unknown> {
  const obj = cls.toObject() as unknown as Record<string, unknown>
  const teacherIds = [cls.teacherId, ...(cls.assistantTeacherIds ?? [])].map((t) => String((t as { _id?: unknown })?._id ?? t))
  const allowed = authReq.user?.role === 'admin' || (authReq.user?.role === 'teacher' && teacherIds.includes(String(authReq.userId)))
  if (!allowed) delete obj.studentTuition
  return obj
}

export async function getClass(req: Request, res: Response): Promise<void> {
  const cls = await Class.findById(req.params.id)
    .populate('teacherId', 'name email')
    .populate('assistantTeacherIds', 'name email')
    .populate('studentIds', 'name email')
    .populate('courseId', 'name level')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  ok(res, withoutPrivateTuition(req as AuthRequest, cls))
}

/** PUT /api/classes/:id/student-tuition/:studentId — admin đặt học phí RIÊNG cho
 *  1 học sinh (giá riêng/buổi hoặc giảm/tăng %, bắt buộc lý do). Ghi nguyên tử
 *  từng bước (thay mục cũ, hoặc thêm nếu chưa có) — qua historyPlugin nên bản
 *  cũ được cất; nhật ký ghi rõ trước/sau. Phiếu ĐÃ gửi không đổi. */
export async function setStudentTuition(req: Request, res: Response): Promise<void> {
  const check = checkStudentTuitionInput(req.body)
  if (!check.ok) { badRequest(res, check.message); return }
  const studentId = String(req.params.studentId)
  const cls = await Class.findById(req.params.id, 'studentIds studentTuition tuitionPerSession')
  if (!cls) { notFound(res, 'Không tìm thấy lớp.'); return }
  if (!cls.studentIds.some((id) => String(id) === studentId)) { badRequest(res, 'Học sinh không thuộc lớp này.'); return }
  const before = (cls.studentTuition ?? []).find((x) => String(x.studentId) === studentId)
  const entry = { studentId: new Types.ObjectId(studentId), ...check.rule, updatedBy: new Types.ObjectId((req as AuthRequest).userId), updatedAt: new Date() }
  const r = await Class.updateOne({ _id: cls._id, 'studentTuition.studentId': entry.studentId }, { $set: { 'studentTuition.$': entry } })
  if (r.matchedCount === 0) {
    await Class.updateOne({ _id: cls._id, 'studentTuition.studentId': { $ne: entry.studentId } }, { $push: { studentTuition: entry } })
  }
  await writeAudit(req, {
    action: 'class.studentTuition.set', resource: 'Class', resourceId: String(cls._id),
    metadata: { studentId, classRate: cls.tuitionPerSession ?? null, before: before ? { mode: before.mode, value: before.value, reason: before.reason } : null, after: check.rule },
  })
  const fresh = await Class.findById(cls._id, 'studentTuition').lean()
  ok(res, fresh?.studentTuition ?? [])
}

/** DELETE /api/classes/:id/student-tuition/:studentId — bỏ học phí riêng, quay về giá lớp. */
export async function removeStudentTuition(req: Request, res: Response): Promise<void> {
  const studentId = String(req.params.studentId)
  const cls = await Class.findById(req.params.id, 'studentTuition')
  if (!cls) { notFound(res, 'Không tìm thấy lớp.'); return }
  const before = (cls.studentTuition ?? []).find((x) => String(x.studentId) === studentId)
  if (!before) { ok(res, cls.studentTuition ?? []); return }
  await Class.updateOne({ _id: cls._id }, { $pull: { studentTuition: { studentId: new Types.ObjectId(studentId) } } })
  await writeAudit(req, {
    action: 'class.studentTuition.remove', resource: 'Class', resourceId: String(cls._id),
    metadata: { studentId, before: { mode: before.mode, value: before.value, reason: before.reason } },
  })
  const fresh = await Class.findById(cls._id, 'studentTuition').lean()
  ok(res, fresh?.studentTuition ?? [])
}

export async function updateClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const cls = await Class.findById(req.params.id, 'teacherId assistantTeacherIds')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  if (authReq.user?.role !== 'admin' && !isClassTeacher(cls, authReq.userId!)) {
    forbidden(res, 'You can only update your own classes.')
    return
  }
  // Đơn giá học phí/lương chỉ admin được sửa — giáo viên sở hữu lớp vẫn sửa
  // được các trường khác (tên, lịch học...) qua chính endpoint này.
  const BILLING_FIELDS = ['tuitionPerSession', 'teacherPayPerSession', 'teacherPayMode', 'teacherPayPerStudentSession']
  if (authReq.user?.role !== 'admin' && BILLING_FIELDS.some((f) => f in req.body)) {
    forbidden(res, 'Chỉ quản trị viên được sửa đơn giá học phí/lương.')
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
  const cls = await Class.findById(req.params.id, 'studentIds').populate('studentIds', 'name email role avatar handwritingNote sessionOffset')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  ok(res, cls.studentIds)
}

/** DELETE /api/classes/:id — teacher or admin deletes a class */
export async function deleteClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const cls = await Class.findById(req.params.id, 'teacherId assistantTeacherIds')
  if (!cls) {
    notFound(res, 'Class not found.')
    return
  }
  if (authReq.user?.role !== 'admin' && !isClassTeacher(cls, authReq.userId!)) {
    forbidden(res, 'You can only delete your own classes.')
    return
  }
  await Class.findByIdAndDelete(req.params.id)
  await writeAudit(req, { action: 'class.delete', resource: 'Class', resourceId: String(cls._id) })
  ok(res, { deleted: true })
}

/** POST /api/classes/:id/students/bulk — teacher adds students by name (no phone/account needed) */
export async function addManagedStudents(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { names } = req.body as { names: string[] }

  if (!Array.isArray(names) || names.length === 0) {
    badRequest(res, 'names array is required.')
    return
  }

  const cls = await Class.findById(req.params.id, 'teacherId assistantTeacherIds studentIds')
  if (!cls) { notFound(res, 'Class not found.'); return }

  if (authReq.user?.role !== 'admin' && !isClassTeacher(cls, authReq.userId!)) {
    forbidden(res, 'You can only add students to your own classes.')
    return
  }

  const created_students = []
  for (const rawName of names) {
    const name = rawName.trim()
    if (!name) continue

    // Auto-generate unique internal email (not real, not for login)
    const slug = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '')
    const suffix = crypto.randomBytes(4).toString('hex')
    const email = `${slug}.${suffix}@managed.internal`
    const password = crypto.randomBytes(16).toString('hex')

    const student = await User.create({
      name,
      email,
      passwordHash: password,
      role: 'student',
      isActive: true,
    })
    created_students.push(student)
  }

  if (created_students.length > 0) {
    await Class.findByIdAndUpdate(req.params.id, {
      $addToSet: { studentIds: { $each: created_students.map((s) => s._id) } },
    })
    await writeAudit(req, { action: 'class.addManagedStudents', resource: 'Class', resourceId: String(cls._id) })
  }

  ok(res, created_students.map((s) => ({ _id: String(s._id), name: s.name })))
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
