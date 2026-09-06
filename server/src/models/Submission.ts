import { Schema, model, type Document, type Types } from 'mongoose'

export type SubmissionStatus = 'submitted' | 'reviewed'

export interface IPhotoItem {
  url: string           // Cloudinary URL
  publicId: string      // Cloudinary public_id (để xóa)
}

export interface IQuizAnswer {
  questionId: string
  // mcq: chỉ số đã chọn; fill: text; truefalse: boolean; match: mảng theo thứ tự ghép của học sinh
  value: number[] | string | boolean | string[]
  correct: boolean
  correctText?: string   // đáp án đúng dạng dễ đọc, chỉ hiện sau khi đã chấm (mục đích giáo dục)
}

export interface ISubmission extends Document {
  assignmentId: Types.ObjectId
  classId: Types.ObjectId
  studentId: Types.ObjectId
  submittedBy: Types.ObjectId     // parentId hoặc studentId
  photos: IPhotoItem[]
  videoKey?: string               // R2 object key
  videoMimeType?: string
  answers?: IQuizAnswer[]         // dùng khi assignment.submitType = 'quiz'
  autoScore?: number              // điểm tự chấm (0-100), dùng cho quiz
  status: SubmissionStatus
  teacherComment?: string
  teacherScore?: number
  reviewedAt?: Date
  reviewedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const PhotoItemSchema = new Schema<IPhotoItem>(
  { url: String, publicId: String },
  { _id: false },
)

const QuizAnswerSchema = new Schema<IQuizAnswer>(
  { questionId: String, value: Schema.Types.Mixed, correct: Boolean, correctText: String },
  { _id: false },
)

const SubmissionSchema = new Schema<ISubmission>(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    classId:      { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    studentId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photos:       { type: [PhotoItemSchema], default: [] },
    videoKey:     { type: String },
    videoMimeType:{ type: String },
    answers:      { type: [QuizAnswerSchema], default: undefined },
    autoScore:    { type: Number, min: 0, max: 100 },
    status:       { type: String, enum: ['submitted', 'reviewed'], default: 'submitted' },
    teacherComment: { type: String, maxlength: 2000 },
    teacherScore:   { type: Number, min: 0, max: 100 },
    reviewedAt:     { type: Date },
    reviewedBy:     { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// Mỗi học sinh chỉ nộp 1 lần cho 1 bài tập
SubmissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true })

export const Submission = model<ISubmission>('Submission', SubmissionSchema)
