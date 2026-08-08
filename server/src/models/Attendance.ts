import { Schema, model, type Document, type Types } from 'mongoose'

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

export interface IAttendance extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  classId: Types.ObjectId
  sessionId: Types.ObjectId
  studentId: Types.ObjectId
  status: AttendanceStatus
  minutesLate?: number
  note?: string
  recordedBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const attendanceSchema = new Schema<IAttendance>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['present', 'late', 'absent', 'excused'] as AttendanceStatus[],
      required: true,
      index: true,
    },
    minutesLate: { type: Number, min: 0, max: 480 },
    note: { type: String, trim: true, maxlength: 1000 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
)

attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true })
attendanceSchema.index({ classId: 1, studentId: 1 })
attendanceSchema.index({ centerId: 1, studentId: 1, createdAt: -1 })

export const Attendance = model<IAttendance>('Attendance', attendanceSchema)
