import type { Request } from 'express'
import { Types } from 'mongoose'
import { AuditLog } from '../models/AuditLog.js'
import type { AuthRequest } from '../middleware/auth.js'

interface AuditInput {
  action: string
  resource: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

export async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  const authReq = req as AuthRequest

  await AuditLog.create({
    actorId: authReq.userId ? new Types.ObjectId(authReq.userId) : undefined,
    actorRole: authReq.user?.role,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ? new Types.ObjectId(input.resourceId) : undefined,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: input.metadata,
  })
}
