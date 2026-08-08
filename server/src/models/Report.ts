import { Schema, model, type Document, type Types } from 'mongoose'

export interface IReportPeriod {
  from: Date
  to: Date
  label: string
}

export interface IReport extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  classId: Types.ObjectId
  courseId: Types.ObjectId
  studentId: Types.ObjectId
  teacherId: Types.ObjectId
  rubricId?: Types.ObjectId
  period: IReportPeriod
  title: string
  summary: string
  comment: string
  strengths: string[]
  improvements: string[]
  score?: number
  status: 'draft' | 'published' | 'archived'
  sentTo: Types.ObjectId[]
  sentAt?: Date
  publishedAt?: Date
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const reportPeriodSchema = new Schema<IReportPeriod>(
  {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false },
)

const reportSchema = new Schema<IReport>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'Rubric', index: true },
    period: { type: reportPeriodSchema, required: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    summary: { type: String, required: true, trim: true, maxlength: 5000 },
    comment: { type: String, trim: true, maxlength: 3000, default: '' },
    strengths: [{ type: String, trim: true, maxlength: 500 }],
    improvements: [{ type: String, trim: true, maxlength: 500 }],
    score: { type: Number, min: 0, max: 100 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft', index: true },
    sentTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    sentAt: { type: Date },
    publishedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

// One report per student per class per period
reportSchema.index({ classId: 1, studentId: 1, 'period.from': 1 }, { unique: true })
reportSchema.index({ centerId: 1, status: 1 })
reportSchema.index({ title: 'text', summary: 'text' })

export const Report = model<IReport>('Report', reportSchema)
