import type { Request, Response } from 'express'
import mongoose, { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { Class } from '../models/Class.js'
import { badRequest, created, forbidden, notFound, ok } from '../utils/response.js'
import { parsePagination } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit, writeRejectedAudit } from '../services/auditService.js'
import { isClassTeacher, teacherScopeFilter } from '../utils/classAuth.js'
import { billedChangeBlockReason, billedDeleteBlockReason, dateMoveBlockReason, isStudentInClass, perMonthOfClass, planInsertSession, planRemoveFromNumbering, rejectedWriteMetadata, resolveSessionCreator } from '../utils/dataRules.js'
import { User } from '../models/User.js'
import { TuitionNotice } from '../models/TuitionNotice.js'
import { renumberSessions, RenumberValidationError, createSessionPlacedByDate } from '../services/sessionRenumberService.js'

/** Giáo viên chỉ được xem/sửa/xóa buổi học của các lớp mình dạy — admin qua
 *  hết. Trước đây thiếu kiểm tra này, 1 giáo viên gọi thẳng API có thể
 *  sửa/xóa buổi (và cascade cả Score/Attendance) của lớp giáo viên khác. */
async function canManageSessionOfClass(authReq: AuthRequest, classId: Types.ObjectId | string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId assistantTeacherIds')
  return isClassTeacher(cls, authReq.userId!)
}

export async function listSessions(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const filter: Record<string, unknown> = {
    ...(req.query.classId ? { classId: req.query.classId } : {}),
    ...(req.query.courseId ? { courseId: req.query.courseId } : {}),
    ...(req.query.status ? { status: req.query.status } : {}),
    ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    // Bản ghi buổi học CHUNG cũ, đã được fan-out sang per-student — ẩn mặc định
    // khỏi client (client chưa hiểu cấu trúc mới cho đến khi Phase 2 lên production).
    // ?includeMigrated=true để công cụ admin/debug xem lại bản gốc nếu cần.
    ...(req.query.includeMigrated === 'true' ? {} : { migratedAt: { $exists: false } }),
    // Buổi đã "xóa" (soft delete, xem deleteSession) — ẩn mặc định. ?onlyDeleted=true
    // để màn "Buổi đã xóa" liệt kê đúng các buổi có thể khôi phục.
    ...(req.query.onlyDeleted === 'true' ? { deletedAt: { $exists: true } } : { deletedAt: { $exists: false } }),
  }
  // BUG CŨ (phát hiện khi rà soát đồng bộ đa giáo viên): dòng dưới trước đây
  // LUÔN ghi đè filter.classId bằng "mọi lớp giáo viên này dạy", kể cả khi
  // client đã xin đúng 1 classId cụ thể — khiến GET /sessions?classId=X trả
  // về buổi học của TẤT CẢ lớp giáo viên đó dạy, không riêng lớp X. Hậu quả:
  // mở lớp A vẫn thấy lẫn buổi của lớp B nếu 1 học sinh có mặt ở cả 2 lớp
  // (VD đang chuyển lớp giữa kỳ, tạm thời có mặt ở cả lớp cũ lẫn lớp mới).
  if (authReq.user?.role === 'teacher') {
    if (req.query.classId) {
      const cls = await Class.findById(String(req.query.classId), 'teacherId assistantTeacherIds').lean()
      if (!isClassTeacher(cls, authReq.userId!)) {
        forbidden(res, 'Bạn chỉ có thể xem buổi học của lớp mình dạy.')
        return
      }
      // giữ nguyên filter.classId = req.query.classId đã gán ở trên — CHỈ lớp đó.
    } else {
      const ownClassIds = await Class.find(teacherScopeFilter(authReq.userId!), '_id').lean()
      filter.classId = { $in: ownClassIds.map((c) => c._id) }
    }
  }
  // paginate() không hỗ trợ .populate() — populate createdBy thủ công để client
  // biết giáo viên nào đã ghi buổi này (dùng tính lương/học phí theo buổi).
  const { page, limit, skip, sort } = parsePagination(req.query)
  const [items, total] = await Promise.all([
    ClassSession.find(filter).sort(sort).skip(skip).limit(limit).populate('createdBy', 'name'),
    ClassSession.countDocuments(filter),
  ])
  ok(res, { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) })
}

/** 1 học sinh không được có 2 buổi active (chưa xóa) cùng số — nếu lọt qua
 *  sẽ gây tình trạng "nhiều buổi cùng Buổi N" như đã gặp (số liệu lệch nhau
 *  giữa các màn hình, dễ nhầm buổi khi chấm điểm). Loại trừ buổi đã xóa
 *  (deletedAt) và buổi chung cũ đã fan-out (migratedAt) khỏi việc kiểm tra. */
export async function createSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  // Trước đây không kiểm tra — giáo viên nào cũng tạo được buổi vào lớp người
  // khác (update/delete thì có kiểm tra). Giáo viên phụ vẫn qua (isClassTeacher).
  // Mọi lần từ chối đều ghi nhật ký KÈM nội dung (sự cố 18/10: bị từ chối
  // không để lại dấu vết gì, dữ liệu chỉ còn trên máy rồi mất hẳn).
  const reject = (code: string) => writeRejectedAudit(req, 'session.create.rejected', 'ClassSession', rejectedWriteMetadata(code, req.body))
  if (!(await canManageSessionOfClass(authReq, String(req.body.classId)))) {
    reject('FORBIDDEN')
    forbidden(res, 'Bạn chỉ có thể tạo buổi học cho lớp mình dạy.')
    return
  }
  const { onBehalfOf, ...body } = req.body as { onBehalfOf?: string; [k: string]: unknown }
  // Admin khôi phục hộ từ bản chụp máy giáo viên → người tạo là giáo viên đó.
  const creatorId = resolveSessionCreator(authReq.user?.role, authReq.userId!, onBehalfOf)
  // placeByDate: đẩy buổi đang KẸT trên máy lên — không từ chối vì trùng số,
  // tự xếp đúng vị trí theo ngày (xem createSessionPlacedByDate).
  if (body.placeByDate === true && body.studentId) {
    // Máy giữ bản CŨ có thể còn học sinh đã bị gộp/chuyển khỏi lớp — không
    // tạo lại buổi cho em đó (đồng bộ nền/khôi phục từ bản chụp đều đi đường này).
    const cls = await Class.findById(String(body.classId), 'studentIds').lean()
    if (!isStudentInClass(cls, String(body.studentId))) {
      reject('NOT_IN_CLASS')
      res.status(409).json({ success: false, code: 'NOT_IN_CLASS', message: 'Học sinh này không còn trong lớp — không tạo buổi.' })
      return
    }
    const result = await createSessionPlacedByDate(body as Parameters<typeof createSessionPlacedByDate>[0], creatorId)
    if (result.sameDate) {
      reject('SAME_DATE')
      res.status(409).json({ success: false, code: 'SAME_DATE', message: 'Học sinh đã có 1 buổi cùng ngày này rồi.', data: { existingId: String(result.sameDate._id), lessonNo: result.sameDate.lessonNo } })
      return
    }
    await writeAudit(req, { action: 'session.create', resource: 'ClassSession', resourceId: String(result.session!._id), metadata: { placeByDate: true, ...(creatorId !== authReq.userId ? { onBehalfOf: creatorId } : {}) } })
    created(res, result.session)
    return
  }
  // Tạo buổi có số gõ tay (Thống kê buổi → Thêm buổi, nhập từ Excel): CHÈN vào đúng số đó, các
  // buổi sau lùi 1 — không bao giờ trống/trùng số (planInsertSession). Trùng ngày → từ chối.
  if (body.studentId) {
    const result = await createSessionPlacedByDate(body as Parameters<typeof createSessionPlacedByDate>[0], creatorId, req.body.lessonNo != null ? Number(req.body.lessonNo) : null)
    if (result.sameDate) {
      reject('SAME_DATE')
      res.status(409).json({ success: false, code: 'SAME_DATE', message: 'Học sinh đã có 1 buổi cùng ngày này rồi — 1 em không học 2 buổi cùng ngày.', data: { existingId: String(result.sameDate._id), lessonNo: result.sameDate.lessonNo } })
      return
    }
    if (result.refused) {
      reject('BAD_NUMBER')
      badRequest(res, `Không tạo: ${result.refused}.`)
      return
    }
    await writeAudit(req, { action: 'session.create', resource: 'ClassSession', resourceId: String(result.session!._id), metadata: { lessonNo: result.session!.lessonNo, ...(creatorId !== authReq.userId ? { onBehalfOf: creatorId } : {}) } })
    created(res, result.session)
    return
  }
  const session = await ClassSession.create({
    ...body,
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
    createdBy: new Types.ObjectId(creatorId),
  })
  await session.populate('createdBy', 'name')
  await writeAudit(req, { action: 'session.create', resource: 'ClassSession', resourceId: String(session._id) })
  created(res, session)
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const session = await ClassSession.findById(req.params.id)
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  ok(res, session)
}

export async function updateSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await ClassSession.findById(req.params.id, 'classId studentId lessonNo scheduledAt billed')
  if (!existing) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, existing.classId))) {
    forbidden(res, 'You can only update sessions in your own classes.')
    return
  }
  // Dấu "đã thu" chỉ đổi qua phiếu học phí (hoặc admin xác nhận) — xem billedChangeBlockReason.
  if (typeof req.body.billed === 'boolean' && req.body.billed !== !!existing.billed) {
    const inNotice = !!(await TuitionNotice.exists({ sessionIds: existing._id }))
    const blocked = billedChangeBlockReason({ role: authReq.user?.role ?? '', current: !!existing.billed, requested: req.body.billed, inNotice })
    if (blocked) {
      await writeAudit(req, { action: 'session.update.rejected', resource: 'ClassSession', resourceId: String(existing._id), metadata: { code: 'BILLED_CHANGE', requested: req.body.billed } })
      badRequest(res, blocked)
      return
    }
  }
  // Đổi ngày sang ngày em đã có buổi khác → 2 buổi cùng ngày (xem dateMoveBlockReason).
  if (req.body.scheduledAt) {
    const newDate = new Date(req.body.scheduledAt).toISOString().slice(0, 10)
    if (!existing.scheduledAt || newDate !== existing.scheduledAt.toISOString().slice(0, 10)) {
      const others = await ClassSession.find(
        { _id: { $ne: existing._id }, classId: existing.classId, studentId: existing.studentId, deletedAt: { $exists: false }, migratedAt: { $exists: false } },
        'scheduledAt',
      ).lean()
      const blocked = dateMoveBlockReason(newDate, others.filter((o) => o.scheduledAt).map((o) => new Date(o.scheduledAt as Date).toISOString().slice(0, 10)))
      if (blocked) {
        await writeAudit(req, { action: 'session.update.rejected', resource: 'ClassSession', resourceId: String(existing._id), metadata: { code: 'SAME_DATE', newDate } })
        badRequest(res, blocked)
        return
      }
    }
  }
  // Điền "Bài tập về nhà" CHỈ KHI server còn trống (nút "Đồng bộ bài tập về
  // nhà" — trước 21/10 bài tập không được gửi lên cho buổi đã có, chỉ nằm trên
  // máy) — không bao giờ ghi đè bài tập đã có, không đổi gì khác.
  if (req.body.notesIfAbsent === true) {
    const notes = typeof req.body.notes === 'string' ? req.body.notes : ''
    if (!notes.trim()) {
      badRequest(res, 'Thiếu bài tập về nhà để điền.')
      return
    }
    const r = await ClassSession.updateOne(
      { _id: existing._id, $or: [{ notes: { $exists: false } }, { notes: null }, { notes: { $regex: /^\s*$/ } }] },
      { $set: { notes } },
    )
    if (r.modifiedCount === 1) await writeAudit(req, { action: 'session.notesFill', resource: 'ClassSession', resourceId: String(existing._id), metadata: { notes: notes.slice(0, 300) } })
    ok(res, { applied: r.modifiedCount === 1 })
    return
  }
  // Điền "Số câu" CHỈ KHI server còn trống (máy giáo viên tự đẩy số câu cũ
  // chỉ nằm trên máy lên) — không bao giờ ghi đè số câu đã có, không đổi gì khác.
  if (req.body.maxesIfAbsent === true) {
    if (!req.body.maxes || !Object.keys(req.body.maxes).length) {
      badRequest(res, 'Thiếu số câu để điền.')
      return
    }
    const r = await ClassSession.updateOne(
      { _id: existing._id, $or: [{ maxes: { $exists: false } }, { maxes: null }, { maxes: {} }] },
      { $set: { maxes: req.body.maxes } },
    )
    if (r.modifiedCount === 1) await writeAudit(req, { action: 'session.maxesFill', resource: 'ClassSession', resourceId: String(existing._id), metadata: { maxes: req.body.maxes } })
    ok(res, { applied: r.modifiedCount === 1 })
    return
  }
  // Chỉ cần kiểm tra khi THỰC SỰ đổi sang số khác — tránh tự báo trùng với
  // chính buổi đang sửa khi admin chỉ đổi ngày/ghi chú, không đổi số buổi.
  // Đổi số 1 buổi lẻ luôn để lại chỗ trống hoặc trùng số → chỉ đổi qua "Sửa số buổi" (đổi cả dãy
  // trong 1 lần, server kiểm tra 1..n — quy định 10/11).
  if (req.body.lessonNo != null && req.body.lessonNo !== existing.lessonNo) {
    await writeAudit(req, { action: 'session.update.rejected', resource: 'ClassSession', resourceId: String(existing._id), metadata: { code: 'NUMBER_SINGLE', requested: req.body.lessonNo } })
    badRequest(res, 'Đổi số buổi dùng nút "Sửa số buổi" (đổi cả dãy cùng lúc để không trống, không trùng số).')
    return
  }
  const session = await ClassSession.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
  await writeAudit(req, { action: 'session.update', resource: 'ClassSession', resourceId: String(session!._id) })
  ok(res, session)
}

/** DELETE /api/sessions/:id — "xóa" 1 buổi học riêng của học sinh, dùng khi
 *  giáo viên tạo nhầm buổi hoặc buổi đó không thực sự diễn ra. SOFT DELETE —
 *  chỉ đánh dấu `deletedAt`, KHÔNG xóa thật khỏi DB và KHÔNG đụng tới Score/
 *  Attendance gắn với nó, để khôi phục lại được toàn vẹn 100% qua restoreSession
 *  nếu bấm nhầm (xem listSessions ẩn các buổi có deletedAt khỏi truy vấn thường). */
export async function deleteSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const session = await ClassSession.findById(req.params.id)
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, session.classId))) {
    forbidden(res, 'You can only delete sessions in your own classes.')
    return
  }
  const blocked = billedDeleteBlockReason(session)
  if (blocked) {
    await writeAudit(req, { action: 'session.delete.rejected', resource: 'ClassSession', resourceId: String(session._id), metadata: { code: 'BILLED' } })
    badRequest(res, blocked)
    return
  }
  // Các buổi phía sau lùi 1 số trong CÙNG giao dịch — không để trống số (planRemoveFromNumbering).
  const siblings = session.studentId ? await ClassSession.find({ classId: session.classId, studentId: session.studentId, deletedAt: { $exists: false }, migratedAt: { $exists: false } }, '_id lessonNo').lean() : []
  const shifts = planRemoveFromNumbering(siblings.map((x) => ({ id: String(x._id), no: x.lessonNo ?? 0 })), String(session._id))
  const tx = await mongoose.startSession()
  try {
    await tx.withTransaction(async () => {
      await ClassSession.updateOne({ _id: session._id }, { $set: { deletedAt: new Date() } }, { session: tx })
      for (const sh of shifts) await ClassSession.updateOne({ _id: sh.id, lessonNo: sh.from }, { $set: { lessonNo: sh.to } }, { session: tx })
    })
  } finally { await tx.endSession() }
  await writeAudit(req, { action: 'session.delete', resource: 'ClassSession', resourceId: String(session._id), metadata: { renumbered: shifts.length } })
  ok(res, { deleted: true })
}

/** POST /api/sessions/:id/restore — khôi phục lại 1 buổi đã "xóa" (gỡ
 *  `deletedAt`) — điểm/bài tập/ghi chú/điểm danh chưa từng bị động tới nên
 *  trở lại y hệt trước khi xóa. */
export async function restoreSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const session = await ClassSession.findById(req.params.id)
  if (!session) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, session.classId))) {
    forbidden(res, 'You can only restore sessions in your own classes.')
    return
  }
  // Khôi phục buổi đã xóa mà em đã có buổi khác cùng ngày → 2 buổi cùng ngày (dateMoveBlockReason).
  if (session.studentId && session.scheduledAt) {
    const others = await ClassSession.find(
      { _id: { $ne: session._id }, classId: session.classId, studentId: session.studentId, deletedAt: { $exists: false }, migratedAt: { $exists: false } },
      'scheduledAt',
    ).lean()
    const blocked = dateMoveBlockReason(session.scheduledAt.toISOString().slice(0, 10), others.filter((o) => o.scheduledAt).map((o) => new Date(o.scheduledAt as Date).toISOString().slice(0, 10)))
    if (blocked) {
      await writeAudit(req, { action: 'session.restore.rejected', resource: 'ClassSession', resourceId: String(session._id), metadata: { code: 'SAME_DATE' } })
      badRequest(res, blocked)
      return
    }
  }
  // Chèn lại đúng vị trí theo ngày, các buổi sau lùi 1 số (planInsertSession) — không trùng số.
  let restoredNo = session.lessonNo
  if (session.studentId && session.scheduledAt) {
    const [cls, user] = await Promise.all([Class.findById(session.classId, 'name level').lean(), User.findById(session.studentId, 'sessionOffset').lean()])
    const siblings = await ClassSession.find({ _id: { $ne: session._id }, classId: session.classId, studentId: session.studentId, deletedAt: { $exists: false }, migratedAt: { $exists: false } }, '_id lessonNo scheduledAt').lean()
    const plan = planInsertSession(siblings.map((x) => ({ id: String(x._id), no: x.lessonNo ?? 0, date: new Date(x.scheduledAt as Date).toISOString().slice(0, 10) })),
      { date: session.scheduledAt.toISOString().slice(0, 10) }, cls ? perMonthOfClass(cls) : 12, (user as { sessionOffset?: number } | null)?.sessionOffset ?? 0)
    if (!plan.ok) { badRequest(res, `Không khôi phục được: ${plan.reason}.`); return }
    restoredNo = plan.newNo
    const tx = await mongoose.startSession()
    try {
      await tx.withTransaction(async () => {
        for (const sh of plan.shifts) await ClassSession.updateOne({ _id: sh.id, lessonNo: sh.from }, { $set: { lessonNo: sh.to } }, { session: tx })
        await ClassSession.updateOne({ _id: session._id }, { $unset: { deletedAt: 1 }, $set: { lessonNo: plan.newNo } }, { session: tx })
      })
    } finally { await tx.endSession() }
  } else {
    session.deletedAt = undefined
    await session.save()
  }
  await writeAudit(req, { action: 'session.restore', resource: 'ClassSession', resourceId: String(session._id), metadata: { lessonNo: restoredNo } })
  const restored = await ClassSession.findById(session._id)
  ok(res, restored)
}

/** POST /api/sessions/batch-renumber — đổi số buổi HÀNG LOẠT trong 1 giao
 *  dịch atomic (xem services/sessionRenumberService.ts) — thay hẳn cách cũ
 *  đổi tuần tự từng buổi 1, vốn có thể kẹt lại nửa chừng nếu mất mạng. */
export async function batchRenumberSessions(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { updates } = req.body as { updates: { sessionId: string; newNo: number }[] }
  try {
    const result = await renumberSessions(updates, {
      userId: authReq.userId!,
      isAdmin: authReq.user?.role === 'admin',
    })
    await writeAudit(req, {
      action: 'session.batchRenumber',
      resource: 'ClassSession',
      metadata: { count: result.updated.length, updates: result.updated },
    })
    ok(res, result)
  } catch (err) {
    if (err instanceof RenumberValidationError) {
      badRequest(res, err.message)
      return
    }
    throw err
  }
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const existing = await ClassSession.findById(req.params.id, 'classId')
  if (!existing) {
    notFound(res, 'Session not found.')
    return
  }
  if (!(await canManageSessionOfClass(authReq, existing.classId))) {
    forbidden(res, 'You can only update sessions in your own classes.')
    return
  }
  const session = await ClassSession.findByIdAndUpdate(
    req.params.id,
    { status: 'completed' },
    { new: true },
  )
  await writeAudit(req, { action: 'session.complete', resource: 'ClassSession', resourceId: String(session!._id) })
  ok(res, session)
}
