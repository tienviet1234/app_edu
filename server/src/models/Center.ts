import { Schema, model, type Document, type Types } from 'mongoose'

export interface ICenterSettings {
  timezone: string
  language: string
  maxBranches: number
  maxStudents: number
}

export interface ICenter extends Document {
  _id: Types.ObjectId
  name: string
  code: string
  address?: string
  phone?: string
  email?: string
  logo?: string
  plan: 'free' | 'pro' | 'enterprise'
  isActive: boolean
  settings: ICenterSettings
  createdAt: Date
  updatedAt: Date
}

const centerSettingsSchema = new Schema<ICenterSettings>(
  {
    timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    language: { type: String, default: 'vi' },
    maxBranches: { type: Number, default: 5, min: 1 },
    maxStudents: { type: Number, default: 500, min: 1 },
  },
  { _id: false },
)

const centerSchema = new Schema<ICenter>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: {
      type: String, required: true, unique: true,
      uppercase: true, trim: true, maxlength: 20,
      match: /^[A-Z0-9_-]+$/,
    },
    address: { type: String, trim: true, maxlength: 500 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    logo: { type: String, trim: true, maxlength: 2000 },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'] as const,
      default: 'free',
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    settings: { type: centerSettingsSchema, default: () => ({}) },
  },
  { timestamps: true },
)

centerSchema.index({ name: 'text' })

export const Center = model<ICenter>('Center', centerSchema)
