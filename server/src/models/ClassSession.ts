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
  },
  { timestamps: true },
)

classSessionSchema.index({ classId: 1, scheduledAt: 1 })
classSessionSchema.index({ centerId: 1, status: 1, scheduledAt: -1 })

export const ClassSession = model<IClassSession>('ClassSession', classSessionSchema)
