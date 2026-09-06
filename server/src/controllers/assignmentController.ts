import type { Request, Response } from 'express'
import { Assignment, type IQuestion } from '../models/Assignment.js'
import { Submission } from '../models/Submission.js'
import { ok, created } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Ẩn đáp án đúng khỏi payload gửi cho học sinh/phụ huynh */
function sanitizeQuestion(q: IQuestion) {
  const base = { id: q.id, type: q.type, text: q.text }
  if (q.type === 'mcq') return { ...base, options: q.options }
  if (q.type === 'match') {
    const pairs = q.pairs ?? []
    return {
      ...base,
      left: pairs.map((p) => p.left),
      rightOptions: shuffle(pairs.map((p) => p.right)),
    }
  }
  return base // fill, truefalse: không có gì cần ẩn ngoài đáp án đúng, đã loại bỏ ở base
}

function sanitizeAssignment<T extends { questions?: IQuestion[] }>(a: T, isTeacher: boolean): T {
  if (isTeacher || !a.questions) return a
  return { ...a, questions: a.questions.map(sanitizeQuestion) as IQuestion[] }
}

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const isTeacher = authReq.user?.role === 'teacher' || authReq.user?.role === 'admin'
  const { classId, sessionId } = req.query
  const filter: Record<string, unknown> = { isActive: true }
  if (classId) filter.classId = classId
  if (sessionId) filter.sessionId = sessionId

  const items = await Assignment.find(filter).sort({ dueDate: -1 }).lean()
  ok(res, items.map((a) => sanitizeAssignment(a, isTeacher)))
})

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const isTeacher = authReq.user?.role === 'teacher' || authReq.user?.role === 'admin'
  const assignment = await Assignment.findById(req.params.id).lean()
  if (!assignment) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  ok(res, sanitizeAssignment(assignment, isTeacher))
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
