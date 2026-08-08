import type { NextFunction, Request, Response } from 'express'
import { User, type UserRole } from '../models/User.js'
import { verifyAccessToken } from '../utils/jwt.js'
import { forbidden, unauthorized } from '../utils/response.js'

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    name: string
    email: string
    role: UserRole
  }
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

  if (!token) {
    unauthorized(res, 'Authentication required.')
    return
  }

  try {
    const payload = verifyAccessToken(token)
    const user = await User.findById(payload.sub)

    if (!user || !user.isActive) {
      unauthorized(res, 'Account is inactive or no longer exists.')
      return
    }

    req.userId = String(user._id)
    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    }

    next()
  } catch {
    unauthorized(res, 'Invalid or expired access token.')
  }
}

const ROLE_RANK: Record<UserRole, number> = {
  parent: 1,
  student: 2,
  teacher: 3,
  admin: 4,
}

export function authorize(requiredRole: UserRole) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      unauthorized(res, 'Authentication required.')
      return
    }

    if (ROLE_RANK[req.user.role] < ROLE_RANK[requiredRole]) {
      forbidden(res, 'You do not have permission to access this resource.')
      return
    }

    next()
  }
}
