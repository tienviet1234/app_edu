import { Schema, model, type Document } from 'mongoose'

/**
 * Chốt chặn 1 lần cho các script migration dữ liệu chạy tay.
 * Mỗi migration script kiểm tra `Migration.findOne({ key })` trước khi ghi gì,
 * tránh chạy trùng script trên cùng 1 database.
 */
export interface IMigration extends Document {
  key: string
  ranAt: Date
  meta?: Record<string, unknown>
}

const migrationSchema = new Schema<IMigration>({
  key: { type: String, required: true, unique: true },
  ranAt: { type: Date, required: true, default: Date.now },
  meta: { type: Schema.Types.Mixed },
})

export const Migration = model<IMigration>('Migration', migrationSchema)
