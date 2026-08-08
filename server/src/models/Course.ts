import { Schema, model, type Document, type Types } from 'mongoose'

export type CourseLevel = 'primary' | 'secondary' | 'high' | 'adult'

export interface ICourse extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  name: string
  code?: string
  description?: string
  level?: CourseLevel
  rubricId?: Types.ObjectId
  totalSessions?: number
  sessionDuration?: number
  status: 'draft' | 'active' | 'archived'
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const courseSchema = new Schema<ICourse>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, trim: true, uppercase: true, maxlength: 40, index: true },
    description: { type: String, trim: true, maxlength: 2000 },
    level: { type: String, enum: ['primary', 'secondary', 'high', 'adult'] as CourseLevel[] },
    rubricId: { type: Schema.Types.ObjectId, ref: 'Rubric', index: true },
    totalSessions: { type: Number, min: 1, max: 1000 },
    sessionDuration: { type: Number, min: 15, max: 480, default: 90 },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

courseSchema.index({ centerId: 1, status: 1 })
courseSchema.index({ centerId: 1, code: 1 }, { unique: true, sparse: true })
courseSchema.index({ name: 'text', code: 'text', description: 'text' })

export const Course = model<ICourse>('Course', courseSchema)
