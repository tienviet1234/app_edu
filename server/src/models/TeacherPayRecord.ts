import { Schema, model, type Document, type Types } from 'mongoose'

/** Hồ sơ "đã trả lương" cho 1 giáo viên ở ĐÚNG 1 khoảng ngày (thường là 1
 *  tháng dương lịch — hạn trả lương cố định cuối mỗi tháng, xem
 *  billingReminderService) — ADMIN XÁC NHẬN, giống hệt cơ chế TuitionNotice
 *  dùng cho học phí học sinh. Không có endpoint "sửa" — ghi nhầm thì xóa
 *  (DELETE) rồi đánh dấu lại cho đúng, giữ nguyên vẹn lịch sử. */
export interface ITeacherPayRecord extends Document {
  teacherId: Types.ObjectId
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
  amount: number
  note?: string
  paidAt: Date
  paidBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TeacherPayRecordSchema = new Schema<ITeacherPayRecord>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, maxlength: 500 },
    paidAt: { type: Date, required: true },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

// Mỗi giáo viên chỉ có 1 bản ghi "đã trả" cho ĐÚNG 1 khoảng ngày — tránh
// đánh dấu/trả trùng.
TeacherPayRecordSchema.index({ teacherId: 1, from: 1, to: 1 }, { unique: true })

export const TeacherPayRecord = model<ITeacherPayRecord>('TeacherPayRecord', TeacherPayRecordSchema)
