import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listSessions(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    // Bản ghi buổi học CHUNG cũ, đã được fan-out sang per-student — ẩn mặc định
    // khỏi client (client chưa hiểu cấu trúc mới cho đến khi Phase 2 lên production).
    // ?includeMigrated=true để công cụ admin/debug xem lại bản gốc nếu cần.
    ...(req.query.includeMigrated === 'true' ? {} : { migratedAt: { $exists: false } }),
  }
  ok(res, await paginate(ClassSession, filter, req.query))
}

export async function createSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const session = await ClassSession.create({
    ...req.body,
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
    createdBy: new Types.ObjectId(authReq.userId),
  })
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
  const session = await ClassSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  await writeAudit(req, { action: 'session.update', resource: 'ClassSession', resourceId: String(session._id) })
  ok(res, session)
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  const session = await ClassSession.findByIdAndUpdate(
    req.params.id,
    { status: 'completed' },
    { new: true },
  )
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  await writeAudit(req, { action: 'session.complete', resource: 'ClassSession', resourceId: String(session._id) })
  ok(res, session)
}
