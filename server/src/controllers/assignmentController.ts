import type { Request, Response } from 'express'
import { Assignment } from '../models/Assignment.js'
import { Submission } from '../models/Submission.js'
import { ok, created } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { classId, sessionId } = req.query
  const filter: Record<string, unknown> = { isActive: true }
  if (classId) filter.classId = classId
  if (sessionId) filter.sessionId = sessionId

  const items = await Assignment.find(filter).sort({ dueDate: -1 }).lean()
  ok(res, items)
})

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findById(req.params.id).lean()
  if (!assignment) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  ok(res, assignment)
})

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const assignment = await Assignment.create({ ...req.body, createdBy: authReq.userId })
  created(res, assignment)
})

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean()
  if (!assignment) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  ok(res, assignment)
})

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  await Assignment.findByIdAndUpdate(req.params.id, { isActive: false })
  res.status(204).send()
})

/** Lấy thống kê số lượng đã nộp cho 1 bài tập */
export const getAssignmentStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const [total, reviewed] = await Promise.all([
    Submission.countDocuments({ assignmentId: id }),
    Submission.countDocuments({ assignmentId: id, status: 'reviewed' }),
  ])
  ok(res, { total, reviewed, pending: total - reviewed })
})
