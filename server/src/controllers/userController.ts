import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { User, type UserRole } from '../models/User.js'
import { ok, notFound } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import { writeAudit } from '../services/auditService.js'

export function listUsersByRole(role: UserRole) {
  return async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const filter = {
      role,
      ...(q ? { $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] } : {}),
    }

    ok(res, await paginate(User, filter, req.query))
  }
}

export function getUserByRole(role: UserRole) {
  return async (req: Request, res: Response): Promise<void> => {
    const user = await User.findOne({ _id: new Types.ObjectId(String(req.params.id)), role })
    if (!user) {
      notFound(res, `${role} not found.`)
      return
    }

    ok(res, user)
  }
}

/** PATCH /users/:id — admin updates a user's role or isActive status */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const allowed = ['role', 'isActive', 'name', 'phone'] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key]
  }

  const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
  if (!user) {
    notFound(res, 'User not found.')
    return
  }

  await writeAudit(req, { action: 'user.update', resource: 'User', resourceId: String(user._id) })
  ok(res, user)
}

/** GET /users — list all users (admin), optionally filter by role or isActive */
export async function listAllUsers(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  const role = typeof req.query.role === 'string' ? req.query.role : undefined
  const isActiveStr = typeof req.query.isActive === 'string' ? req.query.isActive : undefined
  const filter = {
    ...(role ? { role } : {}),
    ...(isActiveStr === 'false' ? { isActive: false } : isActiveStr === 'true' ? { isActive: true } : {}),
    ...(q ? { $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] } : {}),
  }
  ok(res, await paginate(User, filter, req.query))
}
