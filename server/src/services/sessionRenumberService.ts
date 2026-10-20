/**
 * Đổi số buổi (`lessonNo`) HÀNG LOẠT cho nhiều buổi cùng lúc, trong ĐÚNG 1
 * giao dịch Mongo (transaction) — HOẶC đổi ĐỦ TẤT CẢ thành công, HOẶC không
 * đổi gì cả nếu giữa chừng có lỗi (mất mạng, server restart...). Không còn
 * khả năng "đổi được nửa chừng rồi kẹt ở số tạm" như trước đây.
 *
 * Thay thế hẳn cách cũ ở `ResequenceSessionsModal.applySafely` (frontend lưu
 * TUẦN TỰ từng buổi qua nhiều lần gọi `PATCH /sessions/:id` độc lập — mỗi
 * lần có thể thành/bại riêng, và phải "dọn chỗ tạm" bằng dải số +1000 trước
 * vì chốt chặn trùng số `findConflictingSession` chỉ nhìn từng request 1).
 * Endpoint này bỏ hẳn bước dọn tạm: trong 1 transaction, MongoDB không áp
 * ràng buộc duy nhất nào lên `lessonNo` (không có unique index — xem
 * ClassSession model), nên ghi thẳng số đích cuối cùng cho từng buổi, không
 * cần né trùng tạm thời giữa chừng.
 *
 * Validate đủ trước khi ghi: số đích trong batch không được trùng nhau, và
 * — SAU KHI áp dụng — không được trùng với buổi NGOÀI batch của cùng học
 * sinh (giữ đúng tinh thần `findConflictingSession` cũ, chỉ làm 1 lần duy
 * nhất thay vì mỗi buổi 1 lần).
 */
import mongoose, { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { Class } from '../models/Class.js'
import { isClassTeacher } from '../utils/classAuth.js'

export class RenumberValidationError extends Error {}

export interface RenumberUpdate {
  sessionId: string
  newNo: number
}

export interface RenumberResult {
  updated: Array<{ sessionId: string; oldNo: number | null; newNo: number }>
}

export async function renumberSessions(
  updates: RenumberUpdate[],
  actor: { userId: string; isAdmin: boolean },
): Promise<RenumberResult> {
  const sessionIds = updates.map((u) => new Types.ObjectId(u.sessionId))
  const docs = await ClassSession.find({ _id: { $in: sessionIds } }, 'studentId classId lessonNo')

  const docById = new Map(docs.map((d) => [String(d._id), d]))
  for (const u of updates) {
    if (!docById.has(u.sessionId)) {
      throw new RenumberValidationError(`Không tìm thấy buổi ${u.sessionId} — có thể đã bị xóa, tải lại trang rồi thử lại.`)
    }
  }

  // Tất cả buổi trong batch phải cùng 1 học sinh — đổi số buổi lẫn giữa 2
  // học sinh khác nhau trong 1 lần gọi không có ý nghĩa gì, chặn luôn để lộ
  // bug sớm nếu frontend lỡ gửi nhầm.
  const studentIds = new Set(docs.map((d) => String(d.studentId)))
  if (studentIds.size > 1) {
    throw new RenumberValidationError('Các buổi trong 1 lần đổi số phải cùng 1 học sinh.')
  }

  // Quyền: giáo viên (chính hoặc phụ) của lớp chứa các buổi này, hoặc admin.
  if (!actor.isAdmin) {
    const classIds = [...new Set(docs.map((d) => String(d.classId)))]
    const classes = await Class.find({ _id: { $in: classIds } }, 'teacherId assistantTeacherIds').lean()
    const notOwned = classes.some((c) => !isClassTeacher(c, actor.userId))
    if (notOwned || classes.length !== classIds.length) {
      throw new RenumberValidationError('Bạn chỉ đổi được số buổi của lớp mình dạy.')
    }
  }

  // Số đích trong batch không được trùng nhau.
  const targetNos = updates.map((u) => u.newNo)
  if (new Set(targetNos).size !== targetNos.length) {
    throw new RenumberValidationError('2 buổi trong lần đổi này đang được gán cùng 1 số — mỗi buổi phải có số riêng.')
  }

  // Sau khi áp dụng, số đích không được trùng buổi NGOÀI batch của cùng học
  // sinh (buổi chưa xóa, chưa fan-out) — giữ đúng tinh thần
  // findConflictingSession cũ nhưng kiểm tra 1 lần cho cả batch.
  const studentId = docs[0]?.studentId
  if (studentId) {
    const changingIds = new Set(updates.map((u) => u.sessionId))
    const others = await ClassSession.find(
      { studentId, deletedAt: { $exists: false }, migratedAt: { $exists: false }, _id: { $nin: [...changingIds].map((id) => new Types.ObjectId(id)) } },
      'lessonNo scheduledAt',
    ).lean()
    const otherNos = new Set(others.map((o) => o.lessonNo).filter((n): n is number => n != null))
    const collide = updates.find((u) => otherNos.has(u.newNo))
    if (collide) {
      throw new RenumberValidationError(`Buổi ${collide.newNo} đã có 1 buổi khác (ngoài lần đổi này) của học sinh này rồi — chọn số khác.`)
    }
  }

  const result: RenumberResult = { updated: [] }
  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      for (const u of updates) {
        const doc = docById.get(u.sessionId)!
        result.updated.push({ sessionId: u.sessionId, oldNo: doc.lessonNo ?? null, newNo: u.newNo })
        await ClassSession.updateOne({ _id: doc._id }, { $set: { lessonNo: u.newNo } }, { session: mongoSession })
      }
    })
  } finally {
    await mongoSession.endSession()
  }

  return result
}

/**
 * Tạo buổi mới cho 1 học sinh mà KHÔNG BAO GIỜ bị từ chối vì trùng số buổi —
 * đặt buổi vào đúng vị trí theo NGÀY rồi đánh lại số liên tục 1..N (trong 1
 * giao dịch). Dùng khi đẩy lên server buổi đang KẸT trên máy giáo viên: máy
 * đó tính số buổi theo dữ liệu cũ (VD admin đã thêm bù buổi đầu kỳ, số buổi
 * trên server bị đẩy lên), nên số máy gửi lên thường đã "có chủ" — trước đây
 * server từ chối và dữ liệu nằm kẹt mãi trên máy (sự cố thật 18/10: nhiều em
 * Lớp 3/4/5/7 "mất" điểm dù giáo viên đã nhập).
 *
 * KHÔNG tạo nếu học sinh đã có 1 buổi khác CÙNG NGÀY (tránh tạo buổi trùng
 * ngày) — trả về buổi đó trong `sameDate` để phía gọi tự quyết định.
 */
export async function createSessionPlacedByDate(
  body: Record<string, unknown> & { classId: string; studentId: string; scheduledAt?: string | Date },
  createdBy: string,
): Promise<{ session?: InstanceType<typeof ClassSession>; sameDate?: { _id: Types.ObjectId; lessonNo?: number } }> {
  const studentId = new Types.ObjectId(body.studentId)
  const classId = new Types.ObjectId(body.classId)
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date()
  const dayStart = new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000)
  const active = { deletedAt: { $exists: false }, migratedAt: { $exists: false } }

  const sameDate = await ClassSession.findOne({ studentId, classId, scheduledAt: { $gte: dayStart, $lt: dayEnd }, ...active }, '_id lessonNo').lean()
  if (sameDate) return { sameDate }

  const maxDoc = await ClassSession.findOne({ studentId, ...active }, 'lessonNo').sort({ lessonNo: -1 }).lean()
  const tempNo = (maxDoc?.lessonNo ?? 0) + 1
  // Học sinh có buổi ở LỚP KHÁC (đang chuyển lớp) — không đánh lại số trong
  // lớp này kẻo trùng số với buổi lớp kia (chốt chặn trùng số tính theo học
  // sinh, không theo lớp); chỉ đặt số kế tiếp.
  const inOtherClass = await ClassSession.exists({ studentId, classId: { $ne: classId }, ...active })

  let createdId: Types.ObjectId | undefined
  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      const { placeByDate: _p, ...rest } = body
      const [doc] = await ClassSession.create([{ ...rest, studentId, classId, scheduledAt, lessonNo: tempNo, createdBy: new Types.ObjectId(createdBy) }], { session: mongoSession })
      createdId = doc._id
      if (inOtherClass) return
      const all = await ClassSession.find({ studentId, classId, ...active }, '_id scheduledAt lessonNo', { session: mongoSession }).sort({ scheduledAt: 1, _id: 1 })
      for (let i = 0; i < all.length; i++) {
        if (all[i].lessonNo !== i + 1) await ClassSession.updateOne({ _id: all[i]._id }, { $set: { lessonNo: i + 1 } }, { session: mongoSession })
      }
    })
  } finally {
    await mongoSession.endSession()
  }
  const session = await ClassSession.findById(createdId).populate('createdBy', 'name')
  return { session: session ?? undefined }
}
