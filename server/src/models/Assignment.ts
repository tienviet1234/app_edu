import { Schema, model, type Document, type Types } from 'mongoose'

export type SubmitType = 'photo' | 'video' | 'both'

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
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    classId:    { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    sessionId:  { type: Schema.Types.ObjectId, ref: 'ClassSession', index: true },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title:      { type: String, required: true, trim: true, maxlength: 200 },
    description:{ type: String, trim: true, maxlength: 2000 },
    dueDate:    { type: Date, required: true },
    submitType: { type: String, enum: ['photo', 'video', 'both'], default: 'both' },
    scriptText: { type: String, maxlength: 5000 },
    maxPhotos:  { type: Number, default: 3, min: 1, max: 10 },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true },
)

AssignmentSchema.index({ classId: 1, dueDate: -1 })

export const Assignment = model<IAssignment>('Assignment', AssignmentSchema)
