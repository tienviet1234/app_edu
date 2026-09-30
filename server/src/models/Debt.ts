import { Schema, model, type Document, type Types } from 'mongoose'

export type DebtKind = 'btvn' | 'chep_phat' | 'vocab' | 'other'
export type DebtStatus = 'pending' | 'submitted' | 'cleared'

/** "Nợ bài tập" — ghi nhận RIÊNG TỪNG học sinh chưa nộp/chưa làm 1 việc cụ
 *  thể (BTVN trễ, chép phạt, từ vựng nợ...), phát sinh bất kỳ lúc nào, KHÁC
 *  với Assignment (giao cả lớp cùng lúc, 1 hạn chung). Học sinh/phụ huynh
 *  "trả nợ" bằng cách gõ nội dung vào answerText — giáo viên xem qua rồi
 *  xác nhận (status='cleared'), KHÔNG tự động chấm đúng/sai từng từ. */
export interface IDebt extends Document {
  classId: Types.ObjectId
  studentId: Types.ObjectId
  createdBy: Types.ObjectId
  kind: DebtKind
  label: string
  status: DebtStatus
  answerText?: string
  submittedAt?: Date
  submittedBy?: Types.ObjectId
  clearedAt?: Date
  clearedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const DebtSchema = new Schema<IDebt>(
  {
    classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind:      { type: String, enum: ['btvn', 'chep_phat', 'vocab', 'other'], default: 'other' },
    label:     { type: String, required: true, trim: true, maxlength: 300 },
    status:    { type: String, enum: ['pending', 'submitted', 'cleared'], default: 'pending', index: true },
    answerText:  { type: String, maxlength: 4000 },
    submittedAt: { type: Date },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    clearedAt:   { type: Date },
    clearedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

DebtSchema.index({ classId: 1, studentId: 1, status: 1 })

export const Debt = model<IDebt>('Debt', DebtSchema)
