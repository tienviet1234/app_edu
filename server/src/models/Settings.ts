import { Schema, model, type Document, type Types } from 'mongoose'

export type SettingsScope = 'system' | 'center' | 'branch' | 'user'

export interface ISettings extends Document {
  _id: Types.ObjectId
  scope: SettingsScope
  scopeId?: Types.ObjectId
  key: string
  value: unknown
  updatedBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const settingsSchema = new Schema<ISettings>(
  {
    scope: {
      type: String,
      enum: ['system', 'center', 'branch', 'user'] as SettingsScope[],
      required: true,
      index: true,
    },
    scopeId: { type: Schema.Types.ObjectId, index: true },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// One setting per scope+scopeId+key combination
settingsSchema.index({ scope: 1, scopeId: 1, key: 1 }, { unique: true })

export const Settings = model<ISettings>('Settings', settingsSchema)
