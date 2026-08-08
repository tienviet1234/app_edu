import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Score } from '../models/Score.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

/**
 * GET /api/scores?sessionId=x         → all scores for a session (entry screen load)
 * GET /api/scores?classId=x&studentId=y → student history in a class (report generation)
 */
export async function listScores(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.sessionId ? { sessionId: req.query.sessionId } : {}),
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
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

/**
 * PATCH /api/scores/:id
 * Partial update (e.g. teacher edits a specific component after saving).
 */
export async function updateScore(req: Request, res: Response): Promise<void> {
  const score = await Score.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
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
  const scores = await Score.find({ sessionId: req.params.sessionId })
    .populate('studentId', 'name')
    .lean()
  ok(res, scores)
}
