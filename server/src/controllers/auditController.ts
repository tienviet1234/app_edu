import type { Request, Response } from 'express'
import { AuditLog } from '../models/AuditLog.js'
import { ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.actorId ? { actorId: req.query.actorId } : {}),
    ...(req.query.resource ? { resource: req.query.resource } : {}),
    ...(req.query.action ? { action: req.query.action } : {}),
  }
  ok(res, await paginate(AuditLog, filter, req.query))
}
