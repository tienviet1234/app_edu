import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Assignment, type IQuestion } from '../models/Assignment.js'
import { Submission } from '../models/Submission.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'
import { Notification } from '../models/Notification.js'
import { sendPushToUser } from '../services/pushService.js'
import { ok, created, forbidden } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

/** Học sinh/phụ huynh chỉ xem được bài tập của lớp mình (con mình) đang học
 *  — trước đây không kiểm tra, ai cũng đổi classId trong query để xem tiêu
 *  đề/mô tả bài tập của lớp khác (đáp án đúng vẫn được ẩn đúng cách nhờ
 *  sanitizeAssignment, nhưng vẫn là truy cập trái phép nội dung lớp khác). */
async function assertCanViewClass(authReq: AuthRequest, classId: string): Promise<boolean> {
  const role = authReq.user?.role
  if (role === 'admin' || role === 'teacher') return true
  const cls = await Class.findById(classId, 'studentIds').lean()
  if (!cls) return false
  const studentIdSet = new Set(cls.studentIds.map((id) => String(id)))
  if (role === 'student') return studentIdSet.has(String(authReq.userId))
  if (role === 'parent') {
    const parent = await User.findById(authReq.userId, 'childIds').lean()
    return (parent?.childIds ?? []).some((id) => studentIdSet.has(String(id)))
  }
  return false
}

/** Giáo viên chỉ được tạo/sửa/xóa/xem bài tập của lớp MÌNH dạy — trước đây
 *  chỉ cần authorize('teacher') là thao tác được bài tập của bất kỳ lớp
 *  nào. Admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  return !!cls?.teacherId && String(cls.teacherId) === String(authReq.userId)
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Ẩn đáp án đúng khỏi payload gửi cho học sinh/phụ huynh */
function sanitizeQuestion(q: IQuestion) {
  const base = { id: q.id, type: q.type, text: q.text }
  if (q.type === 'mcq') return { ...base, options: q.options }
  if (q.type === 'match') {
    const pairs = q.pairs ?? []
    return {
      ...base,
      left: pairs.map((p) => p.left),
      rightOptions: shuffle(pairs.map((p) => p.right)),
    }
  }
  if (q.type === 'order') return { ...base, items: shuffle(q.items ?? []) }
  return base // fill, truefalse, cloze: không có gì cần ẩn ngoài đáp án đúng, đã loại bỏ ở base
}

function sanitizeAssignment<T extends { questions?: IQuestion[] }>(a: T, isTeacher: boolean): T {
  if (isTeacher || !a.questions) return a
  return { ...a, questions: a.questions.map(sanitizeQuestion) as IQuestion[] }
}

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const role = authReq.user?.role
  const isTeacher = role === 'teacher' || role === 'admin'
  const { classId, sessionId } = req.query

  if (!isTeacher) {
    // Học sinh/phụ huynh bắt buộc chỉ rõ lớp và phải thuộc lớp đó — không
    // được bỏ trống classId (sẽ trả về bài tập của TOÀN BỘ các lớp).
    if (!classId || !(await assertCanViewClass(authReq, String(classId)))) {
      forbidden(res, 'Bạn chỉ có thể xem bài tập của lớp mình/con mình đang học.')
      return
    }
  }

  const filter: Record<string, unknown> = { isActive: true }
  if (classId) filter.classId = classId
  if (sessionId) filter.sessionId = sessionId

  if (role === 'teacher') {
    if (classId) {
      if (!(await assertTeacherOwnsClass(authReq, String(classId)))) {
        forbidden(res, 'Bạn chỉ có thể xem bài tập của lớp mình dạy.')
        return
      }
    } else {
      const ownClassIds = await Class.find({ teacherId: authReq.userId }, '_id').lean()
      filter.classId = { $in: ownClassIds.map((c) => c._id) }
    }
  }

  const items = await Assignment.find(filter).sort({ dueDate: -1 }).lean()
  ok(res, items.map((a) => sanitizeAssignment(a, isTeacher)))
})

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const role = authReq.user?.role
  const isTeacher = role === 'teacher' || role === 'admin'
  const assignment = await Assignment.findById(req.params.id).lean()
  if (!assignment) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  if (!isTeacher && !(await assertCanViewClass(authReq, String(assignment.classId)))) {
    forbidden(res, 'Bạn chỉ có thể xem bài tập của lớp mình/con mình đang học.')
    return
  }
  if (role === 'teacher' && !(await assertTeacherOwnsClass(authReq, String(assignment.classId)))) {
    forbidden(res, 'Bạn chỉ có thể xem bài tập của lớp mình dạy.')
    return
  }
  ok(res, sanitizeAssignment(assignment, isTeacher))
})

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  if (!(await assertTeacherOwnsClass(authReq, String(req.body.classId)))) {
    forbidden(res, 'Bạn chỉ có thể giao bài tập cho lớp mình dạy.')
    return
  }
  const assignment = await Assignment.create({ ...req.body, createdBy: authReq.userId })

  // Báo ngay cho học sinh trong lớp khi có bài tập mới — trước đây học sinh
  // chỉ biết có bài tập nếu tự vào xem lại, không có thông báo chủ động nào.
  const cls = await Class.findById(assignment.classId).select('studentIds centerId')
  if (cls?.studentIds.length) {
    const title = 'Bài tập mới'
    const body = `${assignment.title} — hạn nộp ${new Date(assignment.dueDate).toLocaleDateString('vi-VN')}`
    const createdBy = new Types.ObjectId(authReq.userId)
    await Notification.insertMany(
      cls.studentIds.map((sid) => ({
        centerId: cls.centerId,
        recipientId: sid,
        title,
        body,
        type: 'course' as const,
        data: { classId: String(assignment.classId), assignmentId: String(assignment._id) },
        createdBy,
      })),
    )
    cls.studentIds.forEach((sid) =>
      void sendPushToUser(String(sid), { title, body, tag: `assignment-${assignment._id}`, url: '/app' }),
    )
  }

  created(res, assignment)
})

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const existing = await Assignment.findById(req.params.id, 'classId')
  if (!existing) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  if (!(await assertTeacherOwnsClass(authReq, String(existing.classId)))) {
    forbidden(res, 'Bạn chỉ có thể sửa bài tập của lớp mình dạy.')
    return
  }
  const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean()
  ok(res, assignment)
})

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const existing = await Assignment.findById(req.params.id, 'classId')
  if (!existing) { res.status(404).json({ success: false, message: 'Không tìm thấy bài tập' }); return }
  if (!(await assertTeacherOwnsClass(authReq, String(existing.classId)))) {
    forbidden(res, 'Bạn chỉ có thể xóa bài tập của lớp mình dạy.')
    return
  }
  await Assignment.findByIdAndUpdate(req.params.id, { isActive: false })
  res.status(204).send()
})

/** Lấy thống kê số lượng đã nộp cho 1 bài tập */
export const getAssignmentStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const [total, reviewed] = await Promise.all([
    Submission.countDocuments({ assignmentId: id }),
    Submission.countDocuments({ assignmentId: id, status: 'reviewed' }),
  ])
  ok(res, { total, reviewed, pending: total - reviewed })
})
