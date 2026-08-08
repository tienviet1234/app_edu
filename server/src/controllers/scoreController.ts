import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Score } from '../models/Score.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { created, forbidden, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

/**
 * GET /api/scores?sessionId=x         → all scores for a session (entry screen load)
 * GET /api/scores?classId=x&studentId=y → student history in a class (report generation)
 */
export async function listScores(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  const filter: Record<string, unknown> = {}

  if (role === 'student') {
    // Students can only see their own scores
    filter.studentId = userId
    if (req.query.sessionId) filter.sessionId = req.query.sessionId
    if (req.query.classId) filter.classId = req.query.classId
  } else if (role === 'teacher') {
    if (req.query.classId) {
      const cls = await Class.findById(req.query.classId, 'teacherId').lean()
      if (!cls || !new Types.ObjectId(userId).equals(cls.teacherId as Types.ObjectId)) {
        forbidden(res, 'You do not have access to this class.')
        return
      }
      filter.classId = req.query.classId
    } else if (req.query.sessionId) {
      const session = await ClassSession.findById(req.query.sessionId, 'classId').lean()
      if (session) {
        const cls = await Class.findById(session.classId, 'teacherId').lean()
        if (!cls || !new Types.ObjectId(userId).equals(cls.teacherId as Types.ObjectId)) {
          forbidden(res, 'You do not have access to this session.')
          return
        }
      }
      filter.sessionId = req.query.sessionId
    } else {
      // No specific filter — scope to teacher's own classes
      const classes = await Class.find({ teacherId: userId }, '_id').lean()
      filter.classId = { $in: classes.map((c) => c._id) }
    }
    if (req.query.studentId) filter.studentId = req.query.studentId
  } else {
    // admin: pass all filters
    if (req.query.sessionId) filter.sessionId = req.query.sessionId
    if (req.query.classId) filter.classId = req.query.classId
    if (req.query.studentId) filter.studentId = req.query.studentId
  }

  ok(res, await paginate(Score, filter, req.query))
}

export async function getScore(req: Request, res: Response): Promise<void> {
  const score = await Score.findById(req.params.id)
  if (!score) {
    notFound(res, 'Score not found.')
    return
  }
  ok(res, score)
}

/**
 * POST /api/scores/upsert
 * Upsert the full SessionEntry for one student in one session.
 * Idempotent — teacher can save multiple times; last write wins.
 */
export async function upsertScore(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { sessionId, studentId, ...rest } = req.body as {
    sessionId: string
    studentId: string
    [key: string]: unknown
  }

  const score = await Score.findOneAndUpdate(
    {
      sessionId: new Types.ObjectId(sessionId),
      studentId: new Types.ObjectId(studentId),
    },
    {
      ...rest,
      sessionId: new Types.ObjectId(sessionId),
      studentId: new Types.ObjectId(studentId),
      recordedBy: new Types.ObjectId(authReq.userId),
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )

  await writeAudit(req, { action: 'score.upsert', resource: 'Score', resourceId: String(score._id) })
  created(res, score)
}

const SCORE_UPDATABLE = ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev', 'note', 'total', 'attendance'] as const

/**
 * PATCH /api/scores/:id
 * Partial update (e.g. teacher edits a specific component after saving).
 */
export async function updateScore(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  // Ownership check: only the teacher of this score's class (or admin) can update
  if (role !== 'admin') {
    const existing = await Score.findById(req.params.id, 'classId').lean()
    if (existing) {
      const cls = await Class.findById((existing as { classId: Types.ObjectId }).classId, 'teacherId').lean()
      if (!cls || !new Types.ObjectId(userId).equals(cls.teacherId as Types.ObjectId)) {
        forbidden(res, 'You do not have permission to update this score.')
        return
      }
    }
  }

  // Whitelist: never allow overwriting identity/ownership fields
  const patch: Record<string, unknown> = {}
  for (const key of SCORE_UPDATABLE) {
    if (key in req.body) patch[key] = req.body[key]
  }

  const score = await Score.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
  if (!score) {
    notFound(res, 'Score not found.')
    return
  }
  await writeAudit(req, { action: 'score.update', resource: 'Score', resourceId: String(score._id) })
  ok(res, score)
}

/**
 * GET /api/scores/session/:sessionId/summary
 * Returns all scores for a session with student name populated.
 * Used by the Entry screen to build the full class view.
 */
export async function sessionSummary(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  if (role !== 'admin') {
    const session = await ClassSession.findById(req.params.sessionId, 'classId').lean()
    if (session) {
      const cls = await Class.findById(session.classId, 'teacherId studentIds').lean()
      const isTeacher = cls && new Types.ObjectId(userId).equals(cls.teacherId as Types.ObjectId)
      const isStudent = cls && (cls.studentIds as Types.ObjectId[]).some((id) => id.equals(userId))
      if (!isTeacher && !isStudent) {
        forbidden(res, 'You do not have access to this session.')
        return
      }
    }
  }

  const scores = await Score.find({ sessionId: req.params.sessionId })
    .populate('studentId', 'name')
    .lean()
  ok(res, scores)
}
