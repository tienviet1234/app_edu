import { Schema, model, type Document, type Types } from 'mongoose'

/** Bản chụp TOÀN BỘ dữ liệu đang nằm trên máy 1 giáo viên/admin (localStorage
 *  của app), tự gửi lên định kỳ khi có thay đổi — lưới an toàn cuối cùng: kể
 *  cả khi lưu điểm/buổi lên server bị từ chối hay lỗi mạng, dữ liệu trên máy
 *  vẫn có 1 bản nằm trên R2 để admin tải về khôi phục (sự cố thật 18/10: điểm
 *  kẹt trên máy giáo viên vì server từ chối, suýt mất hẳn nếu máy bị xóa cache).
 *  Nội dung thật lưu trên R2 (`r2Key`), Mongo chỉ giữ metadata để liệt kê. */
export interface IClientSnapshot extends Document {
  _id: Types.ObjectId
  userId: Types.ObjectId
  deviceId: string
  userAgent?: string
  /** Phiên bản app trên máy lúc chụp (header X-App-Version). */
  appVersion?: string
  r2Key: string
  sizeBytes: number
  contentHash: string
  classCount: number
  sessionCount: number
  unsyncedSessionCount: number
  createdAt: Date
}

const clientSnapshotSchema = new Schema<IClientSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true, maxlength: 80 },
    userAgent: { type: String, maxlength: 300 },
    appVersion: { type: String, maxlength: 40 },
    r2Key: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    contentHash: { type: String, required: true, maxlength: 80 },
    classCount: { type: Number, default: 0 },
    sessionCount: { type: Number, default: 0 },
    unsyncedSessionCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
clientSnapshotSchema.index({ userId: 1, deviceId: 1, createdAt: -1 })

export const ClientSnapshot = model<IClientSnapshot>('ClientSnapshot', clientSnapshotSchema)
