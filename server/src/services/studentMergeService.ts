/**
 * Hợp nhất 2 TÀI KHOẢN của cùng 1 học sinh (1 tài khoản cũ ở lớp cũ, 1 tài
 * khoản mới vô tình bị tạo trùng ở lớp mới khi giáo viên thêm tên thủ công)
 * thành 1 — dùng khi học sinh CHUYỂN LỚP giữa kỳ và đã lỡ có 2 tài khoản
 * riêng biệt thay vì chuyển đúng 1 tài khoản cũ sang.
 *
 * Dùng chung bởi: route API (`studentMergeController.ts`, cho admin/giáo
 * viên thao tác trực tiếp trên app) VÀ script CLI
 * (`scripts/mergeStudentIntoClass.ts`, chạy tay khi cần). Giữ logic ở 1 nơi
 * để không bị lệch giữa 2 đường gọi — xem ghi chú gotcha "logic phức tạp
 * phải viết thành hàm thuần kèm test" ở CLAUDE.md.
 *
 * Giữ `oldStudentId` làm danh tính SỐNG SÓT (thường là tài khoản có lịch sử
 * dài hơn/có khoản học phí gắn vào). Toàn bộ buổi của `newStudentId` được
 * GỘP vào, xếp lại theo đúng NGÀY THẬT (`scheduledAt`) — KHÔNG dùng
 * `lessonNo` cũ (thường đã lộn xộn do chấm bù/sửa lỗi trước đó).
 *
 * Đổi `classId` cho 6 collection: ClassSession, Score, Attendance,
 * TuitionNotice, Debt, Report — CHỦ Ý KHÔNG đụng Submission/AiGradedPhoto
 * (gắn với Assignment CHUNG CẢ LỚP, đổi riêng 1 học sinh tạo tham chiếu treo).
 *
 * QUAN TRỌNG — chặn thu tiền trùng: `unbilledSessionsOf()` (frontend) chỉ
 * nhìn field `ClassSession.billed`, KHÔNG nhìn TuitionNotice. Với MỖI khoản
 * đã gửi của `oldStudentId`, đánh dấu billed=true cho TẤT CẢ buổi (sau khi
 * hợp nhất) có ngày <= ngày gửi khoản đó — không cố khớp lại đúng số buổi
 * ghi trên khoản cũ (không thể dựng lại chính xác lịch sử xóa/sửa đã qua),
 * ưu tiên an toàn (không thu trùng) hơn khớp tuyệt đối con số.
 *
 * KHÔNG tự xóa học sinh khỏi `fromClass.studentIds` (lớp cũ) — admin/giáo
 * viên tự làm bằng nút "Xóa học sinh" có sẵn SAU KHI đã kiểm tra lớp mới
 * hiện đúng. CÓ tự gỡ `newStudentId` khỏi `toClass.studentIds` (tài khoản
 * trùng tên đã hợp nhất xong, không xóa User document, chỉ gỡ khỏi danh
 * sách lớp).
 */
import mongoose, { Types } from 'mongoose'
import { ClassSession, type IClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { Attendance } from '../models/Attendance.js'
import { TuitionNotice, type ITuitionNotice } from '../models/TuitionNotice.js'
import { Debt } from '../models/Debt.js'
import { Report } from '../models/Report.js'
import { Class, type IClass } from '../models/Class.js'
import { AuditLog } from '../models/AuditLog.js'

export interface MergeParams {
  oldStudentId: string
  newStudentId: string
  fromClassId: string
  toClassId: string
}

export interface MergeSessionRow {
  sessionId: string
  scheduledAt: string
  oldLessonNo: number | null
  newLessonNo: number
  source: 'old' | 'new'
  billed: boolean
}

export interface MergeNoticeRow {
  periodLabel: string
  finalAmount: number
  paymentStatus: string
  sentAt: string
}

export interface MergePlan {
  fromClassId: string
  fromClassName: string
  toClassId: string
  toClassName: string
  oldStudentId: string
  newStudentId: string
  rows: MergeSessionRow[]
  notices: MergeNoticeRow[]
  debtsCount: number
  reportsCount: number
  billedCount: number
}

export class MergeValidationError extends Error {}

// Y HỆT autoLevel() ở src/constants/rubrics.ts (frontend) — không import
// được qua biên backend/frontend nên chép lại công thức, PHẢI giữ khớp 2 bên.
function autoLevel(name: string): 'primary' | 'secondary' {
  const m = String(name).match(/\d+/)
  const g = m ? Number(m[0]) : 0
  return g >= 1 && g <= 5 ? 'primary' : 'secondary'
}

interface MergeContext {
  fromClass: IClass
  toClass: IClass
  oldSessions: IClassSession[]
  newSessions: IClassSession[]
  renumbered: { session: IClassSession; newLessonNo: number; source: 'old' | 'new' }[]
  billedIds: Set<string>
  notices: ITuitionNotice[]
  debts: Array<{ _id: unknown }>
  reports: Array<{ _id: unknown }>
}

async function loadMergeContext(params: MergeParams): Promise<MergeContext> {
  const oldStudentId = new Types.ObjectId(params.oldStudentId)
  const newStudentId = new Types.ObjectId(params.newStudentId)
  const fromClassId = new Types.ObjectId(params.fromClassId)
  const toClassId = new Types.ObjectId(params.toClassId)

  const [fromClass, toClass] = await Promise.all([
    Class.findById(fromClassId),
    Class.findById(toClassId),
  ])
  if (!fromClass) throw new MergeValidationError(`Không tìm thấy lớp nguồn ${params.fromClassId}`)
  if (!toClass) throw new MergeValidationError(`Không tìm thấy lớp đích ${params.toClassId}`)
  if (!fromClass.studentIds.some((id) => id.equals(oldStudentId))) {
    throw new MergeValidationError(`Tài khoản cũ không có trong danh sách lớp "${fromClass.name}"`)
  }
  if (!toClass.studentIds.some((id) => id.equals(newStudentId))) {
    throw new MergeValidationError(`Tài khoản mới không có trong danh sách lớp "${toClass.name}"`)
  }
  if (oldStudentId.equals(newStudentId)) {
    throw new MergeValidationError('2 tài khoản trùng nhau — không có gì để gộp.')
  }

  const fromLevel = fromClass.level ?? autoLevel(fromClass.name)
  const toLevel = toClass.level ?? autoLevel(toClass.name)
  if (fromLevel !== toLevel) {
    throw new MergeValidationError(
      `2 lớp đang ở 2 CẤP tiêu chí khác nhau — "${fromClass.name}" → ${fromLevel}, "${toClass.name}" → ${toLevel}. ` +
      `Điểm cũ sẽ đọc sai hoàn toàn nếu gộp. Vào màn Lớp học, ô "Phiếu đánh giá" của "${toClass.name}", chọn đúng cấp rồi thử lại.`,
    )
  }

  // CHỈ buổi CÒN HIỆU LỰC — buổi đã xóa mềm giữ nguyên trạng thái xóa,
  // không hồi sinh, không tính vào dãy buổi mới.
  const [oldSessions, newSessions] = await Promise.all([
    ClassSession.find({ classId: fromClassId, studentId: oldStudentId, deletedAt: { $exists: false } }),
    ClassSession.find({ classId: toClassId, studentId: newStudentId, deletedAt: { $exists: false } }),
  ])
  if (!oldSessions.length && !newSessions.length) {
    throw new MergeValidationError('Không có buổi nào còn hiệu lực ở cả 2 tài khoản — không có gì để gộp.')
  }

  // Hợp nhất + xếp theo NGÀY THẬT — không dùng lessonNo cũ (đang lộn xộn).
  // Cùng ngày: giữ ổn định theo _id để preview/run luôn ra kết quả giống
  // hệt nhau (không phụ thuộc thứ tự Mongo trả về).
  const oldIds = new Set(oldSessions.map((s) => String(s._id)))
  const merged = [...oldSessions, ...newSessions].sort((a, b) => {
    const byDate = a.scheduledAt.getTime() - b.scheduledAt.getTime()
    return byDate !== 0 ? byDate : String(a._id).localeCompare(String(b._id))
  })
  const renumbered = merged.map((session, i) => ({
    session,
    newLessonNo: i + 1,
    source: (oldIds.has(String(session._id)) ? 'old' : 'new') as 'old' | 'new',
  }))

  // Khoản học phí đã gửi của tài khoản CŨ — đánh dấu billed=true cho TẤT
  // CẢ buổi (sau hợp nhất) có ngày <= ngày gửi khoản đó.
  const notices = await TuitionNotice.find({ classId: fromClassId, studentId: oldStudentId }).sort({ sentAt: 1 })
  const billedIds = new Set<string>()
  for (const n of notices) {
    renumbered.forEach(({ session }) => {
      if (session.scheduledAt.getTime() <= n.sentAt.getTime()) billedIds.add(String(session._id))
    })
  }

  const [debts, reports] = await Promise.all([
    Debt.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
    Report.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
  ])

  return { fromClass, toClass, oldSessions, newSessions, renumbered, billedIds, notices, debts, reports }
}

function toPlan(ctx: MergeContext, params: MergeParams): MergePlan {
  return {
    fromClassId: params.fromClassId,
    fromClassName: ctx.fromClass.name,
    toClassId: params.toClassId,
    toClassName: ctx.toClass.name,
    oldStudentId: params.oldStudentId,
    newStudentId: params.newStudentId,
    rows: ctx.renumbered.map(({ session, newLessonNo, source }) => ({
      sessionId: String(session._id),
      scheduledAt: session.scheduledAt.toISOString(),
      oldLessonNo: session.lessonNo ?? null,
      newLessonNo,
      source,
      billed: ctx.billedIds.has(String(session._id)),
    })),
    notices: ctx.notices.map((n) => ({
      periodLabel: n.periodLabel,
      finalAmount: n.finalAmount,
      paymentStatus: n.paymentStatus,
      sentAt: n.sentAt.toISOString(),
    })),
    debtsCount: ctx.debts.length,
    reportsCount: ctx.reports.length,
    billedCount: ctx.billedIds.size,
  }
}

/** Xem trước — KHÔNG ghi gì, an toàn gọi nhiều lần. */
export async function previewStudentMerge(params: MergeParams): Promise<MergePlan> {
  const ctx = await loadMergeContext(params)
  return toPlan(ctx, params)
}

export interface RunMergeResult {
  plan: MergePlan
  backup: {
    oldSessions: unknown[]
    newSessions: unknown[]
    tuitionNotices: unknown[]
    debts: unknown[]
    reports: unknown[]
  }
}

/** Chạy thật — ghi dữ liệu thật trong 1 transaction. Validate lại từ đầu
 *  (không tái dùng context đã tính trước đó) để tránh race condition nếu
 *  dữ liệu đổi giữa lúc preview và lúc admin bấm xác nhận. */
export async function runStudentMerge(
  params: MergeParams,
  actor: { actorId?: string; actorRole?: string },
): Promise<RunMergeResult> {
  const ctx = await loadMergeContext(params)
  const plan = toPlan(ctx, params)

  const backup = {
    oldSessions: ctx.oldSessions.map((s) => s.toObject()),
    newSessions: ctx.newSessions.map((s) => s.toObject()),
    tuitionNotices: ctx.notices.map((n) => n.toObject()),
    debts: ctx.debts,
    reports: ctx.reports,
  }

  const oldStudentId = new Types.ObjectId(params.oldStudentId)
  const newStudentId = new Types.ObjectId(params.newStudentId)
  const fromClassId = new Types.ObjectId(params.fromClassId)
  const toClassId = new Types.ObjectId(params.toClassId)
  const sessionIds = ctx.renumbered.map((r) => r.session._id)
  const hasCourse = !!ctx.toClass.courseId

  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      for (const { session, newLessonNo } of ctx.renumbered) {
        await ClassSession.updateOne(
          { _id: session._id },
          {
            $set: {
              classId: toClassId, studentId: oldStudentId, lessonNo: newLessonNo,
              billed: ctx.billedIds.has(String(session._id)),
              ...(hasCourse ? { courseId: ctx.toClass.courseId } : {}),
            },
            $unset: { lessonId: 1, ...(hasCourse ? {} : { courseId: 1 }) },
          },
          { session: mongoSession },
        )
      }

      // Điểm/điểm danh của buổi "lớp mới" đang gắn studentId=newStudentId —
      // phải đổi sang oldStudentId để gộp đúng 1 danh tính.
      await Score.updateMany(
        { sessionId: { $in: sessionIds } },
        { $set: { classId: toClassId, studentId: oldStudentId } },
        { session: mongoSession },
      )
      await Attendance.updateMany(
        { sessionId: { $in: sessionIds } },
        { $set: { classId: toClassId, studentId: oldStudentId } },
        { session: mongoSession },
      )

      await TuitionNotice.updateMany(
        { classId: fromClassId, studentId: oldStudentId },
        { $set: { classId: toClassId } },
        { session: mongoSession },
      )
      await Debt.updateMany(
        { classId: fromClassId, studentId: oldStudentId },
        { $set: { classId: toClassId } },
        { session: mongoSession },
      )
      await Report.updateMany(
        { classId: fromClassId, studentId: oldStudentId },
        { $set: { classId: toClassId } },
        { session: mongoSession },
      )

      // MongoDB cấm $addToSet và $pull cùng tác động 1 field trong 1 lệnh
      // update (lỗi code 40 "would create a conflict") — phải tách 2 lệnh.
      await Class.updateOne(
        { _id: toClassId },
        { $addToSet: { studentIds: oldStudentId } },
        { session: mongoSession },
      )
      await Class.updateOne(
        { _id: toClassId },
        { $pull: { studentIds: newStudentId } },
        { session: mongoSession },
      )
    })
  } finally {
    await mongoSession.endSession()
  }

  await AuditLog.create({
    actorId: actor.actorId ? new Types.ObjectId(actor.actorId) : undefined,
    actorRole: actor.actorRole,
    action: 'student.classMerge',
    resource: 'Class',
    resourceId: toClassId,
    metadata: {
      oldStudentId: params.oldStudentId, newStudentId: params.newStudentId,
      fromClassId: params.fromClassId, toClassId: params.toClassId,
      oldSessions: ctx.oldSessions.length, newSessions: ctx.newSessions.length,
      totalMerged: ctx.renumbered.length, sessionsMarkedBilled: ctx.billedIds.size,
      notices: ctx.notices.length, debts: ctx.debts.length, reports: ctx.reports.length,
    },
  })

  return { plan, backup }
}
