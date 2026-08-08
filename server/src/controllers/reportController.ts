import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Report } from '../models/Report.js'
import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'
import { sendEmail, notificationEmail } from '../services/emailService.js'
import { sendPushToUser } from '../services/pushService.js'

export async function listReports(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const ownFilter = authReq.user?.role === 'student' ? { studentId: authReq.userId } : {}
  const filter = {
    ...ownFilter,
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  }
  ok(res, await paginate(Report, filter, req.query))
}

export async function createReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
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

export async function getReport(req: Request, res: Response): Promise<void> {
  const report = await Report.findById(req.params.id)
    .populate('studentId', 'name email')
    .populate('teacherId', 'name email')
  if (!report) {
    notFound(res, 'Report not found.')
    return
  }
  ok(res, report)
}

export async function updateReport(req: Request, res: Response): Promise<void> {
  const report = await Report.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!report) {
    notFound(res, 'Report not found.')
    return
  }
  await writeAudit(req, { action: 'report.update', resource: 'Report', resourceId: String(report._id) })
  ok(res, report)
}

export async function publishReport(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
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

  // Notify the student and their parents
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
