import { Schema, model, type Document, type Types } from 'mongoose'
import type { UserRole } from './User.js'

export interface IAuditLog extends Document {
  _id: Types.ObjectId
  centerId?: Types.ObjectId
  actorId?: Types.ObjectId
  actorRole?: UserRole
  action: string
  resource: string
  resourceId?: Types.ObjectId
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    centerId: { type: Schema.Types.ObjectId, ref: 'Center', index: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String, enum: ['admin', 'teacher', 'student', 'parent'] },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    resource: { type: String, required: true, trim: true, maxlength: 120, index: true },
    resourceId: { type: Schema.Types.ObjectId, index: true },
    ip: { type: String, trim: true, maxlength: 80 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 })

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema)
