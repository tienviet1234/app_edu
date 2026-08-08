import { Schema, model, type Document, type Types } from 'mongoose'

export interface IBranch extends Document {
  _id: Types.ObjectId
  centerId: Types.ObjectId
  name: string
  address?: string
  phone?: string
  email?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const branchSchema = new Schema<IBranch>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, trim: true, maxlength: 500 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
)

branchSchema.index({ centerId: 1, name: 1 }, { unique: true })

export const Branch = model<IBranch>('Branch', branchSchema)
