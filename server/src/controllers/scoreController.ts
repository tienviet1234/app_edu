import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Score } from '../models/Score.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { User } from '../models/User.js'
import { badRequest, created, forbidden, notFound, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit, writeRejectedAudit } from '../services/auditService.js'
import { isClassTeacher, teacherScopeFilter } from '../utils/classAuth.js'
import { decideIfAbsent, isStaleWrite, isWriteToDeletedSession, rejectedWriteMetadata, resolveScoreClassId } from '../utils/dataRules.js'

/** Giáo viên chỉ được đọc/ghi điểm của lớp MÌNH dạy (kể cả giáo viên PHỤ,
 *  `assistantTeacherIds` — 1 lớp có thể do 2 giáo viên cùng quản lý) — admin
 *  qua hết. */
async function assertTeacherOwnsClass(userId: string, classId: Types.ObjectId | string): Promise<boolean> {
  const cls = await Class.findById(classId, 'teacherId assistantTeacherIds').lean()
  return isClassTeacher(cls, userId)
}

/**
 * GET /api/scores?sessionId=x         → all scores for a session (entry screen load)
 * GET /api/scores?classId=x&studentId=y → student history in a class (report generation)
 */
export async function listScores(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  const filter: Record<string, unknown> = {}

  if (role === 'student') {
    // Students can only see their own scores
    filter.studentId = userId
    if (req.query.sessionId) filter.sessionId = req.query.sessionId
    if (req.query.classId) filter.classId = req.query.classId
  } else if (role === 'teacher') {
    if (req.query.classId) {
      const cls = await Class.findById(req.query.classId, 'teacherId assistantTeacherIds').lean()
      if (!isClassTeacher(cls, userId)) {
        forbidden(res, 'You do not have access to this class.')
        return
      }
      filter.classId = req.query.classId
    } else if (req.query.sessionId) {
      const session = await ClassSession.findById(req.query.sessionId, 'classId').lean()
      if (session) {
        const cls = await Class.findById(session.classId, 'teacherId assistantTeacherIds').lean()
        if (!isClassTeacher(cls, userId)) {
          forbidden(res, 'You do not have access to this session.')
          return
        }
      }
      filter.sessionId = req.query.sessionId
    } else {
      // No specific filter — scope to teacher's own classes
      const classes = await Class.find(teacherScopeFilter(userId), '_id').lean()
      filter.classId = { $in: classes.map((c) => c._id) }
    }
    if (req.query.studentId) filter.studentId = req.query.studentId
  } else {
    // admin: pass all filters
    if (req.query.sessionId) filter.sessionId = req.query.sessionId
    if (req.query.classId) filter.classId = req.query.classId
    if (req.query.studentId) filter.studentId = req.query.studentId
  }

  ok(res, await paginate(Score, filter, req.query))
}

export async function getScore(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  const score = await Score.findById(req.params.id)
  if (!score) {
    notFound(res, 'Score not found.')
    return
  }

  if (role !== 'admin') {
    let allowed = false
    if (role === 'student') {
      allowed = String(score.studentId) === String(userId)
    } else if (role === 'parent') {
      const parent = await User.findById(userId, 'childIds').lean()
      allowed = (parent?.childIds ?? []).some((id) => String(id) === String(score.studentId))
    } else if (role === 'teacher') {
      allowed = await assertTeacherOwnsClass(userId, score.classId)
    }
    if (!allowed) {
      forbidden(res, 'Bạn không có quyền xem điểm này.')
      return
    }
  }

  ok(res, score)
}

/**
 * POST /api/scores/upsert
 * Upsert the full SessionEntry for one student in one session.
 * Idempotent — teacher can save multiple times; last write wins.
 */
export async function upsertScore(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!
  const { sessionId, studentId, classId, ifAbsent, baseUpdatedAt, ...rest } = req.body as {
    sessionId: string
    studentId: string
    classId: string
    ifAbsent?: boolean
    baseUpdatedAt?: string
    [key: string]: unknown
  }

  // Bảo vệ tính nhất quán: nếu session đã được gắn cho 1 học sinh cụ thể
  // (per-student session), không cho ghi điểm cho học sinh khác vào đó.
  // Bỏ qua kiểm tra nếu session chưa có studentId (bản ghi cũ, dùng chung).
  const session = await ClassSession.findById(sessionId, 'studentId deletedAt classId').lean()
  // classId LẤY THEO BUỔI HỌC, không tin classId máy gửi lên — máy giữ bản cũ
  // (VD học sinh vừa được gộp/chuyển lớp, buổi đã chuyển sang lớp mới) gửi
  // classId lớp CŨ sẽ kéo điểm về lại lớp cũ → điểm "biến mất" khỏi lớp mới.
  const effectiveClassId = resolveScoreClassId(session, classId)

  // Mọi lần từ chối lưu điểm THẬT đều ghi nhật ký KÈM nội dung điểm — bị từ
  // chối thì điểm vẫn còn 1 bản trên server, không chỉ nằm trên máy giáo viên.
  const reject = (code: string) => writeRejectedAudit(req, 'score.upsert.rejected', 'Score', rejectedWriteMetadata(code, req.body))
  if (role !== 'admin' && !(await assertTeacherOwnsClass(userId, effectiveClassId))) {
    reject('FORBIDDEN')
    forbidden(res, 'Bạn chỉ có thể chấm điểm cho lớp mình dạy.')
    return
  }
  if (session?.studentId && String(session.studentId) !== studentId) {
    reject('WRONG_STUDENT')
    badRequest(res, 'Buổi học này không thuộc về học sinh đang chấm.')
    return
  }

  // ifAbsent: đồng bộ nền / khôi phục từ bản chụp — KHÔNG BAO GIỜ ghi đè.
  // Trước đây mỗi lần mở app, máy nào cũng gửi lại toàn bộ điểm trên máy
  // (last write wins) → máy giữ bản CŨ đè mất điểm mới hơn của máy khác.
  if (ifAbsent) {
    const existing = session && !session.deletedAt
      ? await Score.findOne({ sessionId: new Types.ObjectId(sessionId), studentId: new Types.ObjectId(studentId) }).lean()
      : null
    const decision = decideIfAbsent(session, existing)
    if (decision === 'skipDeleted') {
      ok(res, { skipped: true, deleted: true })
      return
    }
    if (decision === 'skipExisting') {
      ok(res, { ...existing, skipped: true })
      return
    }
  } else if (isWriteToDeletedSession(session)) {
    // Buổi đã bị xóa (admin/máy khác) mà máy này còn giữ và vừa sửa — trước đây
    // vẫn ghi + báo thành công, điểm nằm trong buổi đã xóa không ai thấy nữa.
    // Máy nhận mã này sẽ tạo lại buổi theo ngày (giữ nguyên điểm vừa nhập).
    reject('SESSION_DELETED')
    res.status(409).json({ success: false, code: 'SESSION_DELETED', message: 'Buổi học này đã bị xóa trên server.' })
    return
  } else if (baseUpdatedAt) {
    // 2 máy cùng sửa 1 buổi — máy khác đã lưu bản mới hơn bản máy này dựa vào.
    const existing = await Score.findOne({ sessionId: new Types.ObjectId(sessionId), studentId: new Types.ObjectId(studentId) })
      .populate('recordedBy', 'name').lean()
    if (existing && isStaleWrite(existing.updatedAt as Date, baseUpdatedAt)) {
      reject('CONFLICT')
      res.status(409).json({ success: false, code: 'CONFLICT', message: 'Buổi này vừa được lưu bản mới hơn ở máy khác.', data: { score: existing } })
      return
    }
  }

  const score = await Score.findOneAndUpdate(
    {
      sessionId: new Types.ObjectId(sessionId),
      studentId: new Types.ObjectId(studentId),
    },
    {
      ...rest,
      sessionId: new Types.ObjectId(sessionId),
      studentId: new Types.ObjectId(studentId),
      classId: new Types.ObjectId(effectiveClassId),
      recordedBy: new Types.ObjectId(authReq.userId),
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )

  await writeAudit(req, { action: 'score.upsert', resource: 'Score', resourceId: String(score._id) })
  created(res, score)
}

const SCORE_UPDATABLE = ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev', 'note', 'total', 'attendance'] as const

/**
 * PATCH /api/scores/:id
 * Partial update (e.g. teacher edits a specific component after saving).
 */
export async function updateScore(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  // Ownership check: only the teacher of this score's class (or admin) can update
  if (role !== 'admin') {
    const existing = await Score.findById(req.params.id, 'classId').lean()
    if (existing) {
      const cls = await Class.findById((existing as { classId: Types.ObjectId }).classId, 'teacherId assistantTeacherIds').lean()
      if (!isClassTeacher(cls, userId)) {
        forbidden(res, 'You do not have permission to update this score.')
        return
      }
    }
  }

  // Whitelist: never allow overwriting identity/ownership fields
  const patch: Record<string, unknown> = {}
  for (const key of SCORE_UPDATABLE) {
    if (key in req.body) patch[key] = req.body[key]
  }

  const score = await Score.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
  if (!score) {
    notFound(res, 'Score not found.')
    return
  }
  await writeAudit(req, { action: 'score.update', resource: 'Score', resourceId: String(score._id) })
  ok(res, score)
}

/**
 * GET /api/scores/session/:sessionId/summary
 * Returns all scores for a session with student name populated.
 * Used by the Entry screen to build the full class view.
 */
export async function sessionSummary(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { role } = authReq.user!
  const userId = authReq.userId!

  if (role !== 'admin') {
    const session = await ClassSession.findById(req.params.sessionId, 'classId').lean()
    if (session) {
      const cls = await Class.findById(session.classId, 'teacherId assistantTeacherIds studentIds').lean()
      const isTeacher = isClassTeacher(cls, userId)
      const isStudent = cls && (cls.studentIds as Types.ObjectId[]).some((id) => id.equals(userId))
      if (!isTeacher && !isStudent) {
        forbidden(res, 'You do not have access to this session.')
        return
      }
    }
  }

  const scores = await Score.find({ sessionId: req.params.sessionId })
    .populate('studentId', 'name')
    .lean()
  ok(res, scores)
}
