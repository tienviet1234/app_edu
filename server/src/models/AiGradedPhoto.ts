import { Schema, model, type Document, type Types } from 'mongoose'

/** Ảnh bài kiểm tra giấy đã chấm bằng AI, được giáo viên CHỦ ĐỘNG chọn lưu
 *  lại làm bằng chứng/hồ sơ (không tự động, không bắt buộc — khác hẳn luồng
 *  chấm điểm chính ở aiGradingService, vốn KHÔNG lưu ảnh ở đâu cả). Theo
 *  đúng cơ chế lưu ảnh bài nộp (Submission.photos qua Cloudinary). Tự xóa
 *  sau AI_PHOTO_RETENTION_DAYS qua cron dọn dẹp (xem aiGradedPhotoService) —
 *  KHÔNG dùng Mongo TTL index vì còn phải xóa ảnh trên Cloudinary, TTL chỉ
 *  tự xóa document chứ không gọi được API bên ngoài. Chỉ giáo viên dạy đúng
 *  lớp đó + admin xem được (assertTeacherOwnsClass trong controller). */
export interface IAiGradedPhoto extends Document {
  classId: Types.ObjectId
  studentId: Types.ObjectId
  uploadedBy: Types.ObjectId
  photoUrl: string
  photoPublicId: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const AiGradedPhotoSchema = new Schema<IAiGradedPhoto>(
  {
    classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    photoUrl: { type: String, required: true },
    photoPublicId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
)

export const AiGradedPhoto = model<IAiGradedPhoto>('AiGradedPhoto', AiGradedPhotoSchema)
