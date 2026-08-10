import { Schema, model, type Document, type Types } from 'mongoose'
import { randomBytes } from 'crypto'

export type InviteRole = 'teacher'

export interface IInviteToken extends Document {
  _id: Types.ObjectId
  code: string
  role: InviteRole
  createdBy: Types.ObjectId
  expiresAt: Date
  usedBy?: Types.ObjectId
  usedAt?: Date
  isRevoked: boolean
  note?: string
  createdAt: Date
}

const inviteTokenSchema = new Schema<IInviteToken>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 16,
      index: true,
    },
    role: {
      type: String,
      enum: ['teacher'] as InviteRole[],
      required: true,
      default: 'teacher',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    usedAt: { type: Date },
    isRevoked: { type: Boolean, default: false, index: true },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// Compound index for fast lookup during registration
inviteTokenSchema.index({ code: 1, isRevoked: 1, expiresAt: 1 })

export function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase() // e.g. "A3F7K2MP"
}

export const InviteToken = model<IInviteToken>('InviteToken', inviteTokenSchema)
