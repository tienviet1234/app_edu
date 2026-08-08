import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Attendance } from '../models/Attendance.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listAttendance(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.sessionId ? { sessionId: req.query.sessionId } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
  }
  ok(res, await paginate(Attendance, filter, req.query))
}

export async function upsertAttendance(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const attendance = await Attendance.findOneAndUpdate(
    { sessionId: req.body.sessionId, studentId: req.body.studentId },
    { ...req.body, recordedBy: new Types.ObjectId(authReq.userId) },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )
  await writeAudit(req, { action: 'attendance.upsert', resource: 'Attendance', resourceId: String(attendance._id) })
  created(res, attendance)
}

export async function updateAttendance(req: Request, res: Response): Promise<void> {
  const attendance = await Attendance.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!attendance) {
    notFound(res, 'Attendance not found.')
    return
  }
  await writeAudit(req, { action: 'attendance.update', resource: 'Attendance', resourceId: String(attendance._id) })
  ok(res, attendance)
}

export async function deleteAttendance(req: Request, res: Response): Promise<void> {
  const attendance = await Attendance.findByIdAndDelete(req.params.id)
  if (!attendance) {
    notFound(res, 'Attendance not found.')
    return
  }
  await writeAudit(req, { action: 'attendance.delete', resource: 'Attendance', resourceId: String(req.params.id) })
  ok(res, null, 'Attendance deleted.')
}
