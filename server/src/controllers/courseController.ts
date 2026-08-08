import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Course } from '../models/Course.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listCourses(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const filter = {
    ...(req.query.centerId ? { centerId: req.query.centerId } : {}),
    ...(req.query.level ? { level: req.query.level } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(q ? { $or: [{ name: new RegExp(q, 'i') }, { code: new RegExp(q, 'i') }] } : {}),
  }
  ok(res, await paginate(Course, filter, req.query))
}

export async function createCourse(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const course = await Course.create({
    ...req.body,
    createdBy: new Types.ObjectId(authReq.userId),
  })
  await writeAudit(req, { action: 'course.create', resource: 'Course', resourceId: String(course._id) })
  created(res, course)
}

export async function getCourse(req: Request, res: Response): Promise<void> {
  const course = await Course.findById(req.params.id)
  if (!course) {
    notFound(res, 'Course not found.')
    return
  }
  ok(res, course)
}

export async function updateCourse(req: Request, res: Response): Promise<void> {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!course) {
    notFound(res, 'Course not found.')
    return
  }
  await writeAudit(req, { action: 'course.update', resource: 'Course', resourceId: String(course._id) })
  ok(res, course)
}

export async function archiveCourse(req: Request, res: Response): Promise<void> {
  const course = await Course.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true })
  if (!course) {
    notFound(res, 'Course not found.')
    return
  }
  await writeAudit(req, { action: 'course.archive', resource: 'Course', resourceId: String(course._id) })
  ok(res, course)
}
