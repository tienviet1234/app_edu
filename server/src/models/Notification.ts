import { Schema, model, type Document, type Types } from 'mongoose'

export type NotificationType = 'system' | 'course' | 'attendance' | 'report' | 'score' | 'announcement'

export interface INotification extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  recipientId: Types.ObjectId
  title: string
  body: string
  type: NotificationType
  readAt?: Date
  data?: Record<string, unknown>
  createdBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const notificationSchema = new Schema<INotification>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ['system', 'course', 'attendance', 'report', 'score', 'announcement'], default: 'system', index: true },
    readAt: { type: Date },
    data: { type: Schema.Types.Mixed },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 })

export const Notification = model<INotification>('Notification', notificationSchema)
