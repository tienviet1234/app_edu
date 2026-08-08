import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { User } from '../models/User.js'
import { Class } from '../models/Class.js'
import { Score } from '../models/Score.js'
import { badRequest, notFound, ok } from '../utils/response.js'
import type { AuthRequest } from '../middleware/auth.js'

const linkSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

/** POST /api/parents/link-child — kết nối phụ huynh với tài khoản học sinh */
export async function linkChild(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const parsed = linkSchema.safeParse(req.body)
  if (!parsed.success) {
    badRequest(res, 'Email không hợp lệ.')
    return
  }

  const child = await User.findOne({ email: parsed.data.email, role: 'student' })
  if (!child) {
    notFound(res, 'Không tìm thấy tài khoản học sinh với email này. Hãy kiểm tra lại email con đã đăng ký.')
    return
  }

  await User.findByIdAndUpdate(authReq.userId, { $addToSet: { childIds: child._id } })
  ok(res, { id: String(child._id), name: child.name, email: child.email, avatar: child.avatar })
}

/** DELETE /api/parents/unlink-child/:childId */
export async function unlinkChild(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const childOid = new Types.ObjectId(String(req.params.childId))
  await User.findByIdAndUpdate(authReq.userId, {
    $pull: { childIds: childOid },
  })
  ok(res, null, 'Đã hủy kết nối.')
}

/** GET /api/parents/children — lấy thông tin tất cả con đã kết nối */
export async function getChildren(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const parent = await User.findById(authReq.userId).lean()
  const childIds = (parent?.childIds ?? []) as Types.ObjectId[]

  if (!childIds.length) {
    ok(res, [])
    return
  }

  const result = []
  for (const childId of childIds) {
    const child = await User.findById(childId, 'name email avatar').lean()
    if (!child) continue

    const classes = await Class.find({ studentIds: childId }, 'name status teacherId')
      .populate('teacherId', 'name')
      .lean()

    const classesData = await Promise.all(
      classes.map(async (cls) => {
        const scores = await Score.find(
          { studentId: childId, classId: cls._id },
          'total attendance createdAt',
        )
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()

        const totals = scores.filter((s) => s.attendance !== 'excused' && s.attendance !== 'absent').map((s) => s.total)
        const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null
        const presentCount = scores.filter((s) => s.attendance === 'present' || s.attendance === 'late').length

        return {
          id: String(cls._id),
          name: cls.name,
          status: cls.status,
          teacher: (cls.teacherId as unknown as { name: string } | null)?.name ?? '',
          sessionCount: scores.length,
          presentCount,
          avg,
          recentSessions: scores.slice(0, 8).reverse().map((s) => ({
            total: s.total,
            attendance: s.attendance,
            date: s.createdAt,
          })),
        }
      }),
    )

    result.push({
      id: String(child._id),
      name: child.name,
      email: child.email,
      avatar: child.avatar,
      classes: classesData,
    })
  }

  ok(res, result)
}
