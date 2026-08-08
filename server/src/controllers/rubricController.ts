import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Rubric } from '../models/Rubric.js'
import { created, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listRubrics(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const filter = {
    ...(req.query.centerId ? { centerId: req.query.centerId } : {}),
    ...(req.query.level ? { level: req.query.level } : {}),
    ...(req.query.isDefault !== undefined ? { isDefault: req.query.isDefault === 'true' } : {}),
    isActive: true,
    ...(q ? { name: new RegExp(q, 'i') } : {}),
  }
  ok(res, await paginate(Rubric, filter, req.query))
}

export async function createRubric(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const rubric = await Rubric.create({ ...req.body, createdBy: new Types.ObjectId(authReq.userId) })
  await writeAudit(req, { action: 'rubric.create', resource: 'Rubric', resourceId: String(rubric._id) })
  created(res, rubric)
}

export async function getRubric(req: Request, res: Response): Promise<void> {
  const rubric = await Rubric.findById(req.params.id)
  if (!rubric) {
    notFound(res, 'Rubric not found.')
    return
  }
  ok(res, rubric)
}

export async function updateRubric(req: Request, res: Response): Promise<void> {
  const rubric = await Rubric.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  if (!rubric) {
    notFound(res, 'Rubric not found.')
    return
  }
  await writeAudit(req, { action: 'rubric.update', resource: 'Rubric', resourceId: String(rubric._id) })
  ok(res, rubric)
}
