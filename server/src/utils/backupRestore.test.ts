import { describe, it, expect } from 'vitest'
import { Types } from 'mongoose'
import { isLocalMongoUri, reviveBackupDoc } from './backupRestore.js'

const ID = 'a'.repeat(24)
const AT = '2026-10-29T12:46:02.667Z'

describe('reviveBackupDoc (file sao lưu nạp lại được đúng kiểu)', () => {
  it('id và ngày về đúng kiểu, kể cả mảng id', () => {
    const d = reviveBackupDoc({ _id: ID, classId: ID, studentIds: [ID, ID], createdBy: ID, scheduledAt: AT, createdAt: AT })
    expect(d._id).toBeInstanceOf(Types.ObjectId)
    expect(d.classId).toBeInstanceOf(Types.ObjectId)
    expect((d.studentIds as unknown[])[1]).toBeInstanceOf(Types.ObjectId)
    expect(d.createdBy).toBeInstanceOf(Types.ObjectId)
    expect(d.scheduledAt).toBeInstanceOf(Date)
  })
  it('nội dung lồng trong (bản cũ của lịch sử thay đổi) cũng được đổi', () => {
    const d = reviveBackupDoc({ docId: ID, before: { sessionId: ID, updatedAt: AT, note: 'x' } })
    const before = d.before as Record<string, unknown>
    expect(before.sessionId).toBeInstanceOf(Types.ObjectId)
    expect(before.updatedAt).toBeInstanceOf(Date)
    expect(before.note).toBe('x')
  })
  it('không đụng vào nội dung thường: ghi chú giống id, điểm, nhật ký', () => {
    const d = reviveBackupDoc({ note: ID, title: AT, total: 87, parts: { vocab: { pron: 1 } }, metadata: { studentId: ID, baseUpdatedAt: AT } })
    expect(d.note).toBe(ID)
    expect(d.title).toBe(AT)
    expect(d.parts).toEqual({ vocab: { pron: 1 } })
    expect(d.metadata).toEqual({ studentId: ID, baseUpdatedAt: AT })
  })
  it('giá trị không đúng dạng ở trường id/ngày thì giữ nguyên, không làm hỏng', () => {
    expect(reviveBackupDoc({ sessionId: 'local-1', deletedAt: null, createdAt: 'x' })).toEqual({ sessionId: 'local-1', deletedAt: null, createdAt: 'x' })
  })
})

describe('isLocalMongoUri (không bao giờ nạp nhầm vào database thật)', () => {
  it('chỉ nhận máy này', () => {
    expect(isLocalMongoUri('mongodb://localhost:27999/lms_x?directConnection=true')).toBe(true)
    expect(isLocalMongoUri('mongodb://127.0.0.1:27017/lms')).toBe(true)
  })
  it('từ chối Atlas, địa chỉ giả danh, và thiếu cấu hình', () => {
    expect(isLocalMongoUri('mongodb+srv://u:p@cluster.mongodb.net/lms')).toBe(false)
    expect(isLocalMongoUri('mongodb://localhost.evil.net:27017/lms')).toBe(false)
    expect(isLocalMongoUri(undefined)).toBe(false)
  })
})
