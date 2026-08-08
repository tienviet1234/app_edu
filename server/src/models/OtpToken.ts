import { Schema, model, type Document } from 'mongoose'
import bcrypt from 'bcryptjs'

export type OtpPurpose = 'reset_password' | 'verify_email'

export interface IOtpToken extends Document {
  email: string
  otpHash: string
  purpose: OtpPurpose
  attempts: number
  usedAt?: Date
  expiresAt: Date
  createdAt: Date
  // Methods
  compareOtp(plain: string): Promise<boolean>
}

const otpSchema = new Schema<IOtpToken>(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    otpHash: { type: String, required: true, select: false },
    purpose: {
      type: String,
      enum: ['reset_password', 'verify_email'] as OtpPurpose[],
      required: true,
    },
    attempts: { type: Number, default: 0 },
    usedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

otpSchema.pre('save', async function (next) {
  if (!this.isModified('otpHash')) return next()
  this.otpHash = await bcrypt.hash(this.otpHash, 8) // lighter hash for short-lived OTP
  next()
})

otpSchema.methods.compareOtp = function (plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.otpHash)
}

export const OtpToken = model<IOtpToken>('OtpToken', otpSchema)
