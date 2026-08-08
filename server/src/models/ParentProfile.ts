import { Schema, model, type Document, type Types } from 'mongoose'

export type ParentRelationship = 'father' | 'mother' | 'guardian' | 'other'

export interface IParentProfile extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  centerId: Types.ObjectId
  studentIds: Types.ObjectId[]
  relationship: ParentRelationship
  createdAt: Date
  updatedAt: Date
}

const parentProfileSchema = new Schema<IParentProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    studentIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    relationship: {
      type: String,
      enum: ['father', 'mother', 'guardian', 'other'] as ParentRelationship[],
      default: 'guardian',
    },
  },
  { timestamps: true },
)

parentProfileSchema.index({ centerId: 1, userId: 1 })
parentProfileSchema.index({ studentIds: 1 })

export const ParentProfile = model<IParentProfile>('ParentProfile', parentProfileSchema)
