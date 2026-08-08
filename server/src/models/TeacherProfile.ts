import { Schema, model, type Document, type Types } from 'mongoose'

export interface ITeacherRating {
  avg: number
  count: number
}

export interface ITeacherProfile extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  centerId: Types.ObjectId
  branchIds: Types.ObjectId[]
  specializations: string[]
  bio?: string
  experience?: number
  certifications: string[]
  rating: ITeacherRating
  createdAt: Date
  updatedAt: Date
}

const teacherRatingSchema = new Schema<ITeacherRating>(
  {
    avg: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
)

const teacherProfileSchema = new Schema<ITeacherProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    specializations: [{ type: String, trim: true, maxlength: 80 }],
    bio: { type: String, trim: true, maxlength: 2000 },
    experience: { type: Number, min: 0, max: 60 },
    certifications: [{ type: String, trim: true, maxlength: 200 }],
    rating: { type: teacherRatingSchema, default: () => ({ avg: 0, count: 0 }) },
  },
  { timestamps: true },
)

teacherProfileSchema.index({ centerId: 1, userId: 1 })

export const TeacherProfile = model<ITeacherProfile>('TeacherProfile', teacherProfileSchema)
