import { Schema, model, type Document, type Types } from 'mongoose'
import { randomBytes } from 'crypto'

export type ClassStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'

export interface IScheduleSlot {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6
  startTime: string
  endTime: string
  room?: string
}

export interface IClass extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  branchId?: Types.ObjectId
  courseId?: Types.ObjectId
  name: string
  academicYear?: string
  semester?: string
  teacherId?: Types.ObjectId
  assistantTeacherIds: Types.ObjectId[]
  studentIds: Types.ObjectId[]
  schedule: IScheduleSlot[]
  startDate?: Date
  endDate?: Date
  maxStudents: number
  status: ClassStatus
  joinCode: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const scheduleSlotSchema = new Schema<IScheduleSlot>(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    endTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
    room: { type: String, trim: true, maxlength: 80 },
  },
  { _id: false },
)

const classSchema = new Schema<IClass>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    academicYear: { type: String, trim: true, maxlength: 20 },
    semester: { type: String, trim: true, maxlength: 40 },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    assistantTeacherIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    schedule: [scheduleSlotSchema],
    startDate: { type: Date },
    endDate: { type: Date },
    maxStudents: { type: Number, required: true, min: 1, max: 200, default: 30 },
    status: {
      type: String,
      enum: ['upcoming', 'active', 'completed', 'cancelled'] as ClassStatus[],
      default: 'active',
      index: true,
    },
    joinCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      default: () => randomBytes(3).toString('hex').toUpperCase(),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

classSchema.index({ centerId: 1, status: 1 })
classSchema.index({ centerId: 1, teacherId: 1 })
classSchema.index({ centerId: 1, studentIds: 1 })
classSchema.index({ name: 'text' })

export const Class = model<IClass>('Class', classSchema)
