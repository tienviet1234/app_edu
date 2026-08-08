import { Schema, model, type Document, type Types } from 'mongoose'

export interface IStudentProfile extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  centerId: Types.ObjectId
  branchId?: Types.ObjectId
  dateOfBirth?: Date
  grade?: string
  parentIds: Types.ObjectId[]
  notes?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
    dateOfBirth: { type: Date },
    grade: { type: String, trim: true, maxlength: 20 },
    parentIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    notes: { type: String, trim: true, maxlength: 2000 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
)

studentProfileSchema.index({ centerId: 1, userId: 1 })

export const StudentProfile = model<IStudentProfile>('StudentProfile', studentProfileSchema)
