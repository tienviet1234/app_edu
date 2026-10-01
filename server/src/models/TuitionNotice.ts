import { Schema, model, type Document, type Types } from 'mongoose'

/** Hồ sơ "đã gửi thông báo học phí + báo cáo học tập" cho 1 học sinh ở ĐÚNG
 *  1 kỳ (cuối 8 hoặc cuối 12 buổi, xem business/tuition.ts billingPeriodsOf).
 *  Đây là HỒ SƠ TIỀN BẠC — tạo xong KHÔNG cho sửa (chỉ xóa để làm lại nếu ghi
 *  nhầm, giữ nguyên vẹn lịch sử, không có endpoint "update"). finalAmount có
 *  thể khác computedAmount nếu giáo viên chủ động điều chỉnh (giảm giá, học
 *  bù...) — khi đó BẮT BUỘC phải có adjustmentReason để có căn cứ đối chiếu
 *  sau này. reportComment lưu lại ĐÚNG nội dung nhận xét tại thời điểm gửi
 *  (không tính lại sau này dù điểm số có sửa), để hồ sơ gửi phụ huynh khớp
 *  với những gì thực sự đã gửi. */
export type TuitionPaymentStatus = 'unpaid' | 'paid'

export interface ITuitionNotice extends Document {
  classId: Types.ObjectId
  studentId: Types.ObjectId
  periodFrom: number
  periodTo: number
  periodLabel: string
  sessionsBilled: number
  ratePerSession: number
  computedAmount: number
  finalAmount: number
  adjustmentReason?: string
  reportComment: string
  sentAt: Date
  sentBy: Types.ObjectId
  // Trạng thái ĐÃ THU ĐƯỢC TIỀN hay chưa — KHÁC hẳn "đã gửi thông báo" ở trên.
  // Gửi xong không có nghĩa là có tiền ngay (phụ huynh khất, nợ dồn nhiều
  // kỳ...), nên tách riêng 2 mốc thời gian: sentAt (lúc báo) và paidAt (lúc
  // thực nhận tiền) — đây mới là phần trung tâm cần theo dõi "đang nợ ai".
  paymentStatus: TuitionPaymentStatus
  paidAt?: Date
  paidBy?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const TuitionNoticeSchema = new Schema<ITuitionNotice>(
  {
    classId:   { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    periodFrom: { type: Number, required: true },
    periodTo:   { type: Number, required: true },
    periodLabel: { type: String, required: true, trim: true, maxlength: 100 },
    sessionsBilled:  { type: Number, required: true, min: 0 },
    ratePerSession:  { type: Number, required: true, min: 0 },
    computedAmount:  { type: Number, required: true, min: 0 },
    finalAmount:     { type: Number, required: true, min: 0 },
    adjustmentReason: { type: String, trim: true, maxlength: 500 },
    reportComment:   { type: String, trim: true, maxlength: 5000 },
    sentAt: { type: Date, required: true },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid', index: true },
    paidAt: { type: Date },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// Mỗi học sinh chỉ có 1 bản ghi "đã gửi" cho ĐÚNG 1 kỳ — tránh gửi/tính trùng.
TuitionNoticeSchema.index({ classId: 1, studentId: 1, periodFrom: 1, periodTo: 1 }, { unique: true })

export const TuitionNotice = model<ITuitionNotice>('TuitionNotice', TuitionNoticeSchema)
