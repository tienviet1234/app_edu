import { Types } from 'mongoose'

const HEX_ID = /^[0-9a-f]{24}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const ID_KEY = /(^_id$|Id$|Ids$|By$)/
const DATE_KEY = /(At|Date)$/

function reviveValue(key: string, value: unknown): unknown {
  // Nhật ký giữ nguyên văn những gì đã ghi, kể cả id dạng chuỗi.
  if (key === 'metadata') return value
  if (Array.isArray(value)) return value.map((v) => reviveValue(key, v))
  if (value && typeof value === 'object') return reviveBackupDoc(value as Record<string, unknown>)
  if (typeof value === 'string') {
    if (ID_KEY.test(key) && HEX_ID.test(value)) return new Types.ObjectId(value)
    if (DATE_KEY.test(key) && ISO_DATE.test(value)) return new Date(value)
  }
  return value
}

/** File sao lưu DB là JSON thuần: ObjectId và Date đã thành chuỗi. Nạp thẳng vào
 *  MongoDB thì mọi truy vấn theo id/ngày đều không khớp, trông như mất sạch dữ
 *  liệu — phải đổi về đúng kiểu trước khi ghi. */
export function reviveBackupDoc(doc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, reviveValue(k, v)]))
}

/** Chỉ cho khôi phục vào MongoDB trên chính máy này: nạp nhầm vào database thật là
 *  đè mất dữ liệu mới hơn bản sao lưu, và file sao lưu không có mật khẩu. */
export function isLocalMongoUri(uri: string | undefined): boolean {
  return /^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri ?? '')
}
