import { Schema, model, type Document, type Types } from 'mongoose'

export interface IUploadAsset extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  originalName: string
  mimeType: string
  size: number
  url: string
  storageKey?: string
  ownerId: Types.ObjectId
  scope: 'profile' | 'course' | 'session' | 'report' | 'evidence' | 'general'
  relatedId?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const uploadAssetSchema = new Schema<IUploadAsset>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    storageKey: { type: String, trim: true, maxlength: 500 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: ['profile', 'course', 'session', 'report', 'evidence', 'general'], default: 'general', index: true },
    relatedId: { type: Schema.Types.ObjectId, index: true },
  },
  { timestamps: true },
)

export const UploadAsset = model<IUploadAsset>('UploadAsset', uploadAssetSchema)
