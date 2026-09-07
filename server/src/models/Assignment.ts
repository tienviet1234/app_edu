import { Schema, model, type Document, type Types } from 'mongoose'

export type SubmitType = 'photo' | 'video' | 'both' | 'quiz'
export type QuestionType = 'mcq' | 'fill' | 'truefalse' | 'match'

export interface IQuestion {
  id: string
  type: QuestionType
  text?: string                    // đề bài (mcq, fill, truefalse)
  options?: string[]               // mcq: các lựa chọn
  correctIndexes?: number[]        // mcq: chỉ số đáp án đúng (hỗ trợ nhiều đáp án đúng)
  acceptedAnswers?: string[]       // fill: các đáp án được chấp nhận
  correctAnswer?: boolean          // truefalse
  pairs?: { left: string; right: string }[] // match
}

export interface IAssignment extends Document {
  classId: Types.ObjectId
  sessionId?: Types.ObjectId
  createdBy: Types.ObjectId       // teacherId
  title: string
  description?: string
  dueDate: Date
  submitType: SubmitType
  scriptText?: string             // script mẫu để giáo viên so sánh (dùng cho AI sau này)
  maxPhotos: number
  questions?: IQuestion[]         // dùng khi submitType = 'quiz'
  reminder24hSent: boolean        // đã gửi nhắc hạn 24h trước chưa (tránh gửi trùng)
  reminder3hSent: boolean         // đã gửi nhắc hạn 3h trước chưa
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const QuestionSchema = new Schema<IQuestion>(
  {
    id:             { type: String, required: true },
    type:           { type: String, enum: ['mcq', 'fill', 'truefalse', 'match'], required: true },
    text:           { type: String, maxlength: 1000 },
    options:        { type: [String], default: undefined },
    correctIndexes: { type: [Number], default: undefined },
    acceptedAnswers:{ type: [String], default: undefined },
    correctAnswer:  { type: Boolean },
    pairs:          {
      type: [{ left: String, right: String, _id: false }],
      default: undefined,
    },
  },
  { _id: false },
)

const AssignmentSchema = new Schema<IAssignment>(
  {
    classId:    { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    sessionId:  { type: Schema.Types.ObjectId, ref: 'ClassSession', index: true },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title:      { type: String, required: true, trim: true, maxlength: 200 },
    description:{ type: String, trim: true, maxlength: 2000 },
    dueDate:    { type: Date, required: true },
    submitType: { type: String, enum: ['photo', 'video', 'both', 'quiz'], default: 'both' },
    scriptText: { type: String, maxlength: 5000 },
    maxPhotos:  { type: Number, default: 3, min: 1, max: 10 },
    questions:  { type: [QuestionSchema], default: undefined },
    reminder24hSent: { type: Boolean, default: false },
    reminder3hSent:  { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true },
)

AssignmentSchema.index({ classId: 1, dueDate: -1 })
AssignmentSchema.index({ isActive: 1, dueDate: 1, reminder24hSent: 1 })
AssignmentSchema.index({ isActive: 1, dueDate: 1, reminder3hSent: 1 })

export const Assignment = model<IAssignment>('Assignment', AssignmentSchema)
