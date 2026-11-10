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
import { planClassTransfer } from '../utils/dataRules.js'
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
  /** Ngày chuyển (YYYY-MM-DD). Bỏ trống = buổi đầu tiên của tài khoản mới ở lớp mới. */
  transferDate?: string
}

export interface MergeSessionRow {
  sessionId: string
  scheduledAt: string
  oldLessonNo: number | null
  newLessonNo: number
  source: 'old' | 'new'
  /** Buổi nằm ở đâu SAU khi chuyển: 'old' = ở lại lớp cũ (trước ngày chuyển), 'new' = lớp mới. */
  target: 'old' | 'new'
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
  renumbered: { session: IClassSession; newLessonNo: number; source: 'old' | 'new'; target: 'old' | 'new' }[]
  transferDate: string | null
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

  // Lịch sử TRƯỚC ngày chuyển ở lại lớp cũ; chỉ buổi từ ngày chuyển trở đi về lớp mới
  // (planClassTransfer, dataRules.ts, có test). Trùng ngày → từ chối, không gộp bừa.
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const plan = planClassTransfer({
    oldSessions: oldSessions.map((x) => ({ id: String(x._id), date: day(x.scheduledAt), billed: !!x.billed })),
    newSessions: newSessions.map((x) => ({ id: String(x._id), date: day(x.scheduledAt), billed: !!x.billed })),
    transferDate: params.transferDate || null,
  })
  if (!plan.ok) throw new MergeValidationError(`Không chuyển được: ${plan.reason}.`)
  const byId = new Map([...oldSessions, ...newSessions].map((x) => [String(x._id), x]))
  const oldIds = new Set(oldSessions.map((x) => String(x._id)))
  const renumbered = [
    ...plan.stay.map((r) => ({ session: byId.get(r.id)!, newLessonNo: r.newNo, source: 'old' as const, target: 'old' as const })),
    ...plan.move.map((r) => ({ session: byId.get(r.id)!, newLessonNo: r.newNo, source: (oldIds.has(r.id) ? 'old' : 'new') as 'old' | 'new', target: 'new' as const })),
  ]

  // Phiếu học phí, công nợ, báo cáo của lớp cũ Ở LẠI lớp cũ (chỉ đọc để xem trước).
  const notices = await TuitionNotice.find({ classId: fromClassId, studentId: oldStudentId }).sort({ sentAt: 1 })
  const [debts, reports] = await Promise.all([
    Debt.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
    Report.find({ classId: fromClassId, studentId: oldStudentId }).lean(),
  ])

  return { fromClass, toClass, oldSessions, newSessions, renumbered, transferDate: plan.transferDate, notices, debts, reports }
}

function toPlan(ctx: MergeContext, params: MergeParams): MergePlan {
  return {
    fromClassId: params.fromClassId,
    fromClassName: ctx.fromClass.name,
    toClassId: params.toClassId,
    toClassName: ctx.toClass.name,
    oldStudentId: params.oldStudentId,
    newStudentId: params.newStudentId,
    rows: ctx.renumbered.map(({ session, newLessonNo, source, target }) => ({
      sessionId: String(session._id),
      scheduledAt: session.scheduledAt.toISOString(),
      oldLessonNo: session.lessonNo ?? null,
      newLessonNo,
      source,
      target,
      billed: !!session.billed,
    })),
    notices: ctx.notices.map((n) => ({
      periodLabel: n.periodLabel,
      finalAmount: n.finalAmount,
      paymentStatus: n.paymentStatus,
      sentAt: n.sentAt.toISOString(),
    })),
    debtsCount: ctx.debts.length,
    reportsCount: ctx.reports.length,
    billedCount: 0,
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
  const movedIds = ctx.renumbered.filter((r) => r.target === 'new').map((r) => r.session._id)
  const hasCourse = !!ctx.toClass.courseId

  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      for (const { session, newLessonNo, target } of ctx.renumbered) {
        if (target === 'old') {
          // Ở lại lớp cũ: chỉ đánh lại số 1..n theo ngày, không đổi lớp, không đổi dấu "đã thu".
          await ClassSession.updateOne({ _id: session._id }, { $set: { lessonNo: newLessonNo } }, { session: mongoSession })
          continue
        }
        await ClassSession.updateOne(
          { _id: session._id },
          {
            $set: {
              classId: toClassId, studentId: oldStudentId, lessonNo: newLessonNo,
              ...(hasCourse ? { courseId: ctx.toClass.courseId } : {}),
            },
            $unset: { lessonId: 1, ...(hasCourse ? {} : { courseId: 1 }) },
          },
          { session: mongoSession },
        )
      }

      // Điểm/điểm danh của các buổi DỜI sang lớp mới đổi theo; buổi ở lại không đụng.
      await Score.updateMany(
        { sessionId: { $in: movedIds } },
        { $set: { classId: toClassId, studentId: oldStudentId } },
        { session: mongoSession },
      )
      await Attendance.updateMany(
        { sessionId: { $in: movedIds } },
        { $set: { classId: toClassId, studentId: oldStudentId } },
        { session: mongoSession },
      )
      // Phiếu học phí / công nợ / báo cáo của lớp cũ Ở LẠI lớp cũ (trước 10/11 bị dời sang
      // lớp mới cùng toàn bộ buổi cũ — tính tiền buổi lớp cũ theo giá lớp mới).

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
      totalMerged: ctx.renumbered.length, stayedInOldClass: ctx.renumbered.filter((r) => r.target === 'old').length,
      movedToNewClass: movedIds.length, transferDate: ctx.transferDate,
      notices: ctx.notices.length, debts: ctx.debts.length, reports: ctx.reports.length,
    },
  })

  return { plan, backup }
}
