import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { User, type UserRole } from '../models/User.js'
import { Class } from '../models/Class.js'
import { ok, notFound, forbidden } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import { writeAudit } from '../services/auditService.js'
import type { AuthRequest } from '../middleware/auth.js'

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
    const authReq = req as AuthRequest
    const targetId = String(req.params.id)

    // Hồ sơ học sinh chứa dữ liệu trẻ em — giáo viên chỉ tra cứu được học
    // sinh trong lớp mình dạy (khớp nguyên tắc đã áp dụng cho PATCH
    // /students/:id). Tra cứu giáo viên/phụ huynh khác (đồng nghiệp trong
    // cùng trung tâm) giữ nguyên không giới hạn — không phải dữ liệu nhạy
    // cảm tương đương.
    if (role === 'student' && authReq.user?.role !== 'admin') {
      const cls = await Class.findOne({ teacherId: authReq.userId, studentIds: targetId }, '_id').lean()
      if (!cls) {
        forbidden(res, 'Bạn chỉ có thể tra cứu học sinh trong lớp mình dạy.')
        return
      }
    }

    const user = await User.findOne({ _id: new Types.ObjectId(targetId), role })
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

/** PATCH /students/:id — giáo viên sửa tên hiển thị/avatar của học sinh
 *  trong lớp mình dạy (không đổi được email/role/mật khẩu). Trước đây màn
 *  "Lớp học"/"Xếp hạng" chỉ sửa được ở local vì không có endpoint nào cho
 *  giáo viên (chỉ admin sửa được qua PATCH /users/:id). */
export async function updateManagedStudent(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const studentId = req.params.id

  if (authReq.user?.role !== 'admin') {
    const cls = await Class.findOne({ teacherId: authReq.userId, studentIds: studentId }, '_id').lean()
    if (!cls) {
      forbidden(res, 'Bạn chỉ có thể sửa học sinh trong lớp mình dạy.')
      return
    }
  }

  const allowed = ['name', 'avatar'] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in req.body) patch[key] = req.body[key]
  }

  const user = await User.findOneAndUpdate(
    { _id: studentId, role: 'student' },
    patch,
    { new: true, runValidators: true },
  )
  if (!user) {
    notFound(res, 'Student not found.')
    return
  }

  await writeAudit(req, { action: 'student.update', resource: 'User', resourceId: String(user._id) })
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
