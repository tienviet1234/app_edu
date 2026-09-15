import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Notification } from '../models/Notification.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'
import { created, notFound, ok, badRequest, forbidden } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendPushToUser } from '../services/pushService.js'

/** Giáo viên chỉ được gửi thông báo cho học sinh trong lớp mình dạy, hoặc
 *  phụ huynh của học sinh đó — không cho gửi tới người dùng bất kỳ. Admin
 *  qua hết. */
async function assertCanNotifyRecipient(authReq: AuthRequest, recipientId: string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const ownClasses = await Class.find({ teacherId: authReq.userId }, 'studentIds').lean()
  const studentIds = new Set(ownClasses.flatMap((c) => c.studentIds.map((id) => String(id))))
  if (studentIds.has(recipientId)) return true
  const recipient = await User.findById(recipientId, 'role childIds').lean()
  if (recipient?.role === 'parent') {
    return (recipient.childIds ?? []).some((id) => studentIds.has(String(id)))
  }
  return false
}

/** Giáo viên chỉ được thao tác trên lớp MÌNH dạy — admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: Types.ObjectId | string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  return !!cls?.teacherId && String(cls.teacherId) === String(authReq.userId)
}

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const filter = {
    recipientId: authReq.userId,
    ...(req.query.unread === 'true' ? { readAt: { $exists: false } } : {}),
  }
  ok(res, await paginate(Notification, filter, req.query))
}

export async function createNotification(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  if (!(await assertCanNotifyRecipient(authReq, String(req.body.recipientId)))) {
    forbidden(res, 'Bạn chỉ có thể gửi thông báo cho học sinh/phụ huynh trong lớp mình dạy.')
    return
  }
  const notification = await Notification.create({
    ...req.body,
    createdBy: new Types.ObjectId(authReq.userId),
  })
  // Fire-and-forget push to recipient
  void sendPushToUser(String(notification.recipientId), {
    title: notification.title,
    body: notification.body,
    tag: String(notification._id),
    url: '/',
  })
  created(res, notification)
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const count = await Notification.countDocuments({
    recipientId: new Types.ObjectId(authReq.userId),
    readAt: { $exists: false },
  })
  ok(res, { count })
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipientId: authReq.userId },
    { readAt: new Date() },
    { new: true },
  )
  if (!notification) {
    notFound(res, 'Notification not found.')
    return
  }
  ok(res, notification)
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const result = await Notification.updateMany(
    { recipientId: new Types.ObjectId(authReq.userId), readAt: { $exists: false } },
    { readAt: new Date() },
  )
  ok(res, { updated: result.modifiedCount })
}

export async function broadcastToClass(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { classId, title, body, type } = req.body as {
    classId: string; title: string; body: string; type: string
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn chỉ có thể gửi thông báo cho lớp mình dạy.')
    return
  }
  const cls = await Class.findById(classId).select('studentIds centerId')
  if (!cls) { notFound(res, 'Lớp học không tồn tại.'); return }
  if (!cls.studentIds.length) { badRequest(res, 'Lớp chưa có học sinh nào.'); return }

  const createdBy = new Types.ObjectId(authReq.userId)
  const docs = cls.studentIds.map((sid) => ({
    centerId: cls.centerId,
    recipientId: sid,
    title,
    body,
    type: type ?? 'announcement',
    data: { classId },
    createdBy,
  }))
  await Notification.insertMany(docs)

  // Fire-and-forget push to each student
  cls.studentIds.forEach((sid) =>
    void sendPushToUser(String(sid), { title, body, tag: `broadcast-${classId}`, url: '/app' }),
  )

  ok(res, { sent: docs.length })
}
