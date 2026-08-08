import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Lesson } from '../models/Lesson.js'
import { Course } from '../models/Course.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listLessons(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.centerId ? { centerId: req.query.centerId } : {}),
  }
  ok(res, await paginate(Lesson, filter, { ...req.query, sort: 'no', order: 'asc' }))
}

export async function createLesson(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  let { centerId } = req.body as { centerId?: string }
  if (!centerId && req.body.courseId) {
    const course = await Course.findById(req.body.courseId).select('centerId').lean()
    if (course) centerId = String(course.centerId)
  }
  const lesson = await Lesson.create({
    ...req.body,
    centerId,
    createdBy: new Types.ObjectId(authReq.userId),
  })
  await writeAudit(req, { action: 'lesson.create', resource: 'Lesson', resourceId: String(lesson._id) })
  created(res, lesson)
}

export async function getLesson(req: Request, res: Response): Promise<void> {
  const lesson = await Lesson.findById(req.params.id)
  if (!lesson) {
    notFound(res, 'Lesson not found.')
    return
  }
  ok(res, lesson)
}

export async function updateLesson(req: Request, res: Response): Promise<void> {
  const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!lesson) {
    notFound(res, 'Lesson not found.')
    return
  }
  await writeAudit(req, { action: 'lesson.update', resource: 'Lesson', resourceId: String(lesson._id) })
  ok(res, lesson)
}

export async function deleteLesson(req: Request, res: Response): Promise<void> {
  const lesson = await Lesson.findByIdAndDelete(req.params.id)
  if (!lesson) {
    notFound(res, 'Lesson not found.')
    return
  }
  await writeAudit(req, { action: 'lesson.delete', resource: 'Lesson', resourceId: String(req.params.id) })
  ok(res, null, 'Lesson deleted.')
}
