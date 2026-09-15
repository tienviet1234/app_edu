import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Report } from '../models/Report.js'
import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { Class } from '../models/Class.js'
import { created, forbidden, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'
import { sendEmail, notificationEmail } from '../services/emailService.js'
import { sendPushToUser } from '../services/pushService.js'

/** Giáo viên chỉ được đọc/ghi báo cáo của lớp MÌNH dạy — trước đây chỉ cần
 *  authorize('teacher') là thao tác được báo cáo của bất kỳ lớp nào (kích
 *  hoạt cả gửi email/push cho phụ huynh học sinh không phải lớp mình dạy).
 *  Admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: Types.ObjectId | string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  return !!cls?.teacherId && String(cls.teacherId) === String(authReq.userId)
}

export async function listReports(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const role = authReq.user?.role
  const filter: Record<string, unknown> = {
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  }
  if (role === 'student') {
    filter.studentId = authReq.userId
  } else if (role === 'parent') {
    const parent = await User.findById(authReq.userId, 'childIds').lean()
    filter.studentId = { $in: parent?.childIds ?? [] }
  } else if (role === 'teacher') {
    if (req.query.classId) {
      if (!(await assertTeacherOwnsClass(authReq, String(req.query.classId)))) {
        forbidden(res, 'Bạn chỉ có thể xem báo cáo của lớp mình dạy.')
        return
      }
    } else {
      const ownClassIds = await Class.find({ teacherId: authReq.userId }, '_id').lean()
      filter.classId = { $in: ownClassIds.map((c) => c._id) }
    }
  }
  ok(res, await paginate(Report, filter, req.query))
}

export async function createReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  if (!(await assertTeacherOwnsClass(authReq, String(req.body.classId)))) {
    forbidden(res, 'Bạn chỉ có thể tạo báo cáo cho lớp mình dạy.')
    return
  }
  const report = await Report.create({
    ...req.body,
    teacherId: req.body.teacherId ?? new Types.ObjectId(authReq.userId),
    createdBy: new Types.ObjectId(authReq.userId),
  })
  await writeAudit(req, { action: 'report.create', resource: 'Report', resourceId: String(report._id) })
  created(res, report)
}

export async function upsertReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { classId, studentId, period, ...rest } = req.body as {
    classId: string; studentId: string; period: { from: string; to: string; label: string }
    [key: string]: unknown
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn chỉ có thể lưu báo cáo cho lớp mình dạy.')
    return
  }
  const report = await Report.findOneAndUpdate(
    { classId: new Types.ObjectId(classId), studentId: new Types.ObjectId(studentId), 'period.from': new Date(period.from) },
    {
      $set: {
        ...rest,
        classId: new Types.ObjectId(classId),
        studentId: new Types.ObjectId(studentId),
        period,
        teacherId: (rest.teacherId as string | undefined) ? new Types.ObjectId(rest.teacherId as string) : new Types.ObjectId(authReq.userId),
      },
      $setOnInsert: { createdBy: new Types.ObjectId(authReq.userId) },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )
  await writeAudit(req, { action: 'report.upsert', resource: 'Report', resourceId: String(report._id) })
  ok(res, report)
}

async function assertCanViewReport(authReq: AuthRequest, report: { studentId: unknown; classId: unknown }): Promise<boolean> {
  const role = authReq.user?.role
  if (role === 'admin' || role === 'teacher') return assertTeacherOwnsClass(authReq, String(report.classId))
  if (role === 'student') return String(report.studentId) === String(authReq.userId)
  if (role === 'parent') {
    const parent = await User.findById(authReq.userId, 'childIds').lean()
    return (parent?.childIds ?? []).some((id) => String(id) === String(report.studentId))
  }
  return false
}

export async function getReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const report = await Report.findById(req.params.id)
    .populate('studentId', 'name email')
    .populate('teacherId', 'name email')
  if (!report) {
    notFound(res, 'Report not found.')
    return
  }
  if (!(await assertCanViewReport(authReq, report))) {
    forbidden(res, 'Bạn không có quyền xem báo cáo này.')
    return
  }
  ok(res, report)
}

export async function updateReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await Report.findById(req.params.id, 'classId')
  if (!existing) {
    notFound(res, 'Report not found.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, String(existing.classId)))) {
    forbidden(res, 'Bạn chỉ có thể sửa báo cáo của lớp mình dạy.')
    return
  }
  const report = await Report.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  await writeAudit(req, { action: 'report.update', resource: 'Report', resourceId: String(report!._id) })
  ok(res, report)
}

export async function publishReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await Report.findById(req.params.id, 'classId')
  if (!existing) {
    notFound(res, 'Report not found.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, String(existing.classId)))) {
    forbidden(res, 'Bạn chỉ có thể gửi báo cáo của lớp mình dạy.')
    return
  }
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: 'published', publishedAt: new Date() },
    { new: true, runValidators: true },
  )
  if (!report) {
    notFound(res, 'Report not found.')
    return
  }

  const title = 'Báo cáo học tập mới'
  const body = `Báo cáo kỳ ${report.period.label} đã được giáo viên gửi.`

  // Auto-add parents linked to this student into sentTo
  const linkedParents = await User.find(
    { childIds: report.studentId, role: 'parent' },
    '_id',
  ).lean()
  const parentIds = linkedParents.map((p) => p._id)
  if (parentIds.length > 0) {
    await Report.findByIdAndUpdate(report._id, {
      $addToSet: { sentTo: { $each: parentIds } },
    })
    report.sentTo = [...(report.sentTo as unknown as Types.ObjectId[]), ...parentIds] as typeof report.sentTo
  }

  // Notify the student and all linked parents
  const recipientIds = [report.studentId, ...report.sentTo]
  await Promise.all(
    recipientIds.map((recipientId) =>
      Notification.create({
        centerId: report.centerId,
        recipientId,
        title,
        body,
        type: 'report',
        data: { reportId: String(report._id) },
        createdBy: new Types.ObjectId(authReq.userId),
      }),
    ),
  )

  // Push + email to each recipient (fire-and-forget)
  const recipients = await User.find({ _id: { $in: recipientIds } }).select('name email')
  recipients.forEach((u) => {
    void sendPushToUser(String(u._id), { title, body, tag: `report-${report._id}`, url: '/app' })
    void sendEmail({ ...notificationEmail(u.name, title, body), to: u.email })
  })

  await writeAudit(req, { action: 'report.publish', resource: 'Report', resourceId: String(report._id) })
  ok(res, report)
}
