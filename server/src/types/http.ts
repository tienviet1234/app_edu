import type { Request } from 'express'
import type { UserRole } from '../models/User.js'

export interface RequestUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface AppRequest extends Request {
  userId?: string
  user?: RequestUser
}

export interface ListQuery {
  page?: string
  limit?: string
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
}
