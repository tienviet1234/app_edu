import { Schema, model, type Document, type Types } from 'mongoose'

/** Bản CŨ của 1 bản ghi ngay trước khi bị sửa/xóa (điểm, buổi học, học phí,
 *  công nợ, lớp/phiếu chấm) — để luôn lấy lại được đúng nội dung trước đó.
 *  Sao lưu DB chỉ chạy định kỳ: dữ liệu nhập rồi bị đè trong khoảng giữa 2 lần
 *  sao lưu là mất hẳn (sự cố thật 19–20/10: máy giữ bản cũ đẩy đè mất điểm Lớp
 *  7/10 — lấy lại được chỉ nhờ may mắn về giờ sao lưu). Ghi bởi historyPlugin. */
export interface IChangeHistory extends Document {
  coll: string
  docId: Types.ObjectId
  op: string
  before: Record<string, unknown>
  createdAt: Date
}

const changeHistorySchema = new Schema<IChangeHistory>(
  {
    coll: { type: String, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    op: { type: String, required: true },
    before: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
)
changeHistorySchema.index({ coll: 1, docId: 1, createdAt: -1 })
// Giữ 180 ngày — xa hơn đã có sao lưu DB định kỳ trên R2.
changeHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 })

export const ChangeHistory = model<IChangeHistory>('ChangeHistory', changeHistorySchema)
