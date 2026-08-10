import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { InviteToken, generateInviteCode } from '../models/InviteToken.js'
import { ok, badRequest, notFound } from '../utils/response.js'
import type { AuthRequest } from '../middleware/auth.js'

const DEFAULT_EXPIRE_DAYS = 7

export async function createInvite(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { note, expireDays } = req.body as { note?: string; expireDays?: number }

  const days = Math.min(Math.max(Number(expireDays) || DEFAULT_EXPIRE_DAYS, 1), 30)
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  // Generate unique code (retry on collision)
  let code = generateInviteCode()
  for (let i = 0; i < 5; i++) {
    const exists = await InviteToken.exists({ code })
    if (!exists) break
    code = generateInviteCode()
  }

  const token = await InviteToken.create({
    code,
    role: 'teacher',
    createdBy: new Types.ObjectId(authReq.userId!),
    expiresAt,
    note: note?.trim().slice(0, 200) || undefined,
  })

  ok(res, {
    _id: String(token._id),
    code: token.code,
    role: token.role,
    expiresAt: token.expiresAt,
    note: token.note,
    createdAt: token.createdAt,
  })
}

export async function listInvites(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    InviteToken.find()
      .populate('createdBy', 'name email')
      .populate('usedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InviteToken.countDocuments(),
  ])

  const now = new Date()
  const enriched = items.map((t) => ({
    _id: String(t._id),
    code: t.code,
    role: t.role,
    note: t.note,
    createdBy: t.createdBy,
    usedBy: t.usedBy,
    usedAt: t.usedAt,
    expiresAt: t.expiresAt,
    isRevoked: t.isRevoked,
    createdAt: t.createdAt,
    status: t.usedAt
      ? 'used'
      : t.isRevoked
        ? 'revoked'
        : t.expiresAt < now
          ? 'expired'
          : 'active',
  }))

  ok(res, { items: enriched, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}

export async function revokeInvite(req: Request, res: Response): Promise<void> {
  const token = await InviteToken.findById(req.params.id)
  if (!token) { notFound(res, 'Mã mời không tồn tại.'); return }
  if (token.usedAt) { badRequest(res, 'Không thể thu hồi mã đã được sử dụng.'); return }
  if (token.isRevoked) { badRequest(res, 'Mã mời đã bị thu hồi rồi.'); return }

  token.isRevoked = true
  await token.save()
  ok(res, { revoked: true })
}
