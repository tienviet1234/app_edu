import { Schema, model, type Document, type Types } from 'mongoose'

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled'

export interface IClassSession extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  classId: Types.ObjectId
  courseId?: Types.ObjectId
  lessonId?: Types.ObjectId
  title?: string
  lessonNo?: number
  scheduledAt: Date
  durationMinutes: number
  status: SessionStatus
  notes?: string
  createdBy: Types.ObjectId

  // ── Per-student session timeline (migration in progress) ──────────────────
  // studentId optional at the Mongoose level so legacy (pre-migration, shared)
  // documents stay valid; enforced as required for NEW writes at the zod layer.
  studentId?: Types.ObjectId
  // Set on the ORIGINAL shared doc once it has been fanned out into per-student
  // copies. Never deleted — this is the audit/rollback anchor.
  migratedAt?: Date
  // Set on each NEW per-student doc, pointing back to the shared doc it came from.
  legacySharedSessionId?: Types.ObjectId

  // Soft delete — "xóa" chỉ đánh dấu, KHÔNG xóa thật khỏi DB (và không cascade
  // xóa Score/Attendance) để khôi phục lại được toàn vẹn nếu bấm nhầm. Buổi có
  // field này bị ẩn khỏi mọi truy vấn mặc định (xem listSessions).
  deletedAt?: Date

  // Buổi này ĐÃ nằm trong 1 khoản học phí đã gửi (hoặc admin tự xác nhận đã
  // thu tiền trước đó) — loại ra khỏi mọi phép tính "còn thiếu bao nhiêu
  // buổi" ở frontend (xem unbilledSessionsOf, src/business/tuition.ts).
  // Mặc định không có = false, không ảnh hưởng hành vi cũ.
  billed?: boolean

  // "Số câu" riêng buổi này (VD { mini: 30, listen: 20 }) — ghi đè max mặc
  // định của tiêu chí khi tính %. Trước đây CHỈ nằm trên máy giáo viên, nên
  // máy khác (admin/giáo viên phụ) tính % theo số câu mặc định → báo cáo,
  // xếp hạng lệch giữa các máy.
  maxes?: Record<string, number>

  createdAt: Date
  updatedAt: Date
}

const classSessionSchema = new Schema<IClassSession>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', index: true },
    title: { type: String, trim: true, maxlength: 160 },
    lessonNo: { type: Number, min: 1 },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 15, max: 480, default: 90 },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'] as SessionStatus[],
      default: 'scheduled',
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    studentId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    migratedAt: { type: Date },
    legacySharedSessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession' },
    deletedAt: { type: Date },
    billed: { type: Boolean },
    maxes: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)

classSessionSchema.index({ classId: 1, scheduledAt: 1 })
classSessionSchema.index({ classId: 1, studentId: 1, scheduledAt: 1 })
classSessionSchema.index({ centerId: 1, status: 1, scheduledAt: -1 })

export const ClassSession = model<IClassSession>('ClassSession', classSessionSchema)
