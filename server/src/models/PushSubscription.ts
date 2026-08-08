import { Schema, model, type Document, type Types } from 'mongoose'

export interface IPushSubscription extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
  createdAt: Date
  updatedAt: Date
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, maxlength: 2000 },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, maxlength: 500 },
  },
  { timestamps: true },
)

// One subscription object per endpoint (browser tab), user can have many
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true })

export const PushSubscription = model<IPushSubscription>('PushSubscription', pushSubscriptionSchema)
