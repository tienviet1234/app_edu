import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { AuditLog } from '../models/AuditLog.js'
import { ok } from '../utils/response.js'
import type { AuthRequest } from '../middleware/auth.js'

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const filter = {
    ...(req.query.actorId ? { actorId: req.query.actorId } : {}),
    ...(req.query.actorRole ? { actorRole: String(req.query.actorRole) } : {}),
    ...(req.query.resource ? { resource: String(req.query.resource) } : {}),
    ...(req.query.action ? { action: new RegExp(`^${String(req.query.action)}`, 'i') } : {}),
  }
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(Number(req.query.limit) || 30, 500)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('actorId', 'name role email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  ok(res, { items, total, page, totalPages })
}

// POST /api/audit-logs — any authenticated user logs a frontend activity (fire-and-forget)
export async function logActivity(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  try {
    const { action, resource, metadata } = req.body as {
      action: string
      resource?: string
      metadata?: Record<string, unknown>
    }
    // Guard metadata size — reject payloads > 4 KB to prevent abuse
    const metadataStr = JSON.stringify(metadata ?? {})
    const safeMetadata = metadataStr.length <= 4096 ? (metadata ?? {}) : {}

    await AuditLog.create({
      actorId: authReq.userId ? new Types.ObjectId(authReq.userId) : undefined,
      actorRole: authReq.user?.role,
      action: String(action ?? 'app.action').slice(0, 120),
      resource: String(resource ?? 'App').slice(0, 120),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: safeMetadata,
    })
  } catch { /* best-effort */ }
  ok(res, { logged: true })
}
