import { Schema, model, type Document, type Types } from 'mongoose'

export interface ILesson extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  courseId: Types.ObjectId
  no: number
  title: string
  objectives: string[]
  materials: string[]
  duration: number
  activities?: string
  notes?: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const lessonSchema = new Schema<ILesson>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    no: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    objectives: [{ type: String, trim: true, maxlength: 500 }],
    materials: [{ type: String, trim: true, maxlength: 500 }],
    duration: { type: Number, required: true, min: 15, max: 480, default: 90 },
    activities: { type: String, trim: true, maxlength: 5000 },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

// Each lesson number is unique within a course
lessonSchema.index({ courseId: 1, no: 1 }, { unique: true })
lessonSchema.index({ title: 'text' })

export const Lesson = model<ILesson>('Lesson', lessonSchema)
