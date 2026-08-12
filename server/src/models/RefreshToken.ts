import { Schema, model, type Document, type Types } from 'mongoose'

export interface IRefreshToken extends Document {
  userId: Types.ObjectId
  tokenHash: string   // bcrypt hash of raw token — never store raw
  tokenPrefix: string // first 16 chars of raw token — safe to store, used for fast DB lookup
  userAgent?: string
  ip?: string
  expiresAt: Date
  revokedAt?: Date
  createdAt: Date
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    tokenPrefix: { type: String, required: true, index: true }, // narrow lookup before bcrypt
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// A token is valid only if not expired AND not revoked
refreshTokenSchema.virtual('isValid').get(function () {
  return !this.revokedAt && this.expiresAt > new Date()
})

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema)
