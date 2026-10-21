import { describe, it, expect } from 'vitest'
import { decideIfAbsent, isStaleWrite, isStudentInClass, isWriteToDeletedSession, resolveScoreClassId, resolveSessionCreator } from './dataRules.js'

describe('isWriteToDeletedSession (lưu điểm thật vào buổi đã xóa)', () => {
  it('buổi đã xóa → từ chối (trước đây ghi + báo thành công, điểm 10/10–11/10 của Phú biến mất)', () => {
    expect(isWriteToDeletedSession({ deletedAt: new Date('2026-10-16T02:40:00Z') })).toBe(true)
  })
  it('buổi không tồn tại → từ chối (không tạo điểm mồ côi)', () => {
    expect(isWriteToDeletedSession(null)).toBe(true)
  })
  it('buổi còn → cho ghi', () => {
    expect(isWriteToDeletedSession({ deletedAt: null })).toBe(false)
    expect(isWriteToDeletedSession({})).toBe(false)
  })
})

describe('resolveScoreClassId', () => {
  it('lấy classId theo BUỔI HỌC, bỏ qua classId cũ máy gửi lên (học sinh vừa chuyển lớp)', () => {
    expect(resolveScoreClassId({ classId: 'lop-moi' }, 'lop-cu')).toBe('lop-moi')
  })
  it('buổi không có classId (bản ghi cũ) → dùng classId gửi lên', () => {
    expect(resolveScoreClassId({}, 'lop-a')).toBe('lop-a')
    expect(resolveScoreClassId(null, 'lop-a')).toBe('lop-a')
  })
})

describe('decideIfAbsent (đồng bộ nền / khôi phục — không bao giờ ghi đè)', () => {
  it('đã có điểm → bỏ qua, KHÔNG ghi đè bằng bản trên máy', () => {
    expect(decideIfAbsent({}, { total: 75 })).toBe('skipExisting')
  })
  it('buổi đã bị xóa → bỏ qua, không ghi vào buổi đã xóa', () => {
    expect(decideIfAbsent({ deletedAt: new Date() }, null)).toBe('skipDeleted')
  })
  it('buổi không tồn tại → bỏ qua (không tạo điểm mồ côi)', () => {
    expect(decideIfAbsent(null, null)).toBe('skipDeleted')
  })
  it('buổi còn, chưa có điểm → ghi (VD tạo buổi được nhưng gửi điểm lỗi)', () => {
    expect(decideIfAbsent({ deletedAt: null }, null)).toBe('write')
  })
})

describe('isStaleWrite (2 máy cùng sửa 1 buổi)', () => {
  it('máy khác đã lưu bản MỚI HƠN bản máy này dựa vào → từ chối (không để bản lưu sau đè mất)', () => {
    expect(isStaleWrite('2026-10-20T10:00:05.000Z', '2026-10-20T10:00:00.000Z')).toBe(true)
  })
  it('server vẫn đúng bản máy này đã dựa vào → cho ghi', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z')).toBe(false)
  })
  it('không gửi base (buổi mới / dữ liệu cũ) → không kiểm tra, ghi như trước', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', undefined)).toBe(false)
  })
  it('server chưa có điểm → cho ghi', () => {
    expect(isStaleWrite(null, '2026-10-20T10:00:00.000Z')).toBe(false)
  })
  it('base rác → không chặn nhầm', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', 'abc')).toBe(false)
  })
})

describe('isStudentInClass', () => {
  it('học sinh đã gộp/chuyển khỏi lớp → false (không tạo lại buổi cũ)', () => {
    expect(isStudentInClass({ studentIds: ['a', 'b'] }, 'c')).toBe(false)
  })
  it('còn trong lớp → true (so theo chuỗi, ObjectId cũng được)', () => {
    expect(isStudentInClass({ studentIds: [{ toString: () => 'a' }] }, 'a')).toBe(true)
  })
  it('lớp không còn → false', () => {
    expect(isStudentInClass(null, 'a')).toBe(false)
  })
})

describe('resolveSessionCreator', () => {
  it('admin đẩy hộ → ghi đúng giáo viên chủ máy là người tạo (lương/Thống kê buổi)', () => {
    expect(resolveSessionCreator('admin', 'admin-id', 'teacher-id')).toBe('teacher-id')
  })
  it('giáo viên KHÔNG được ghi tên người khác', () => {
    expect(resolveSessionCreator('teacher', 'teacher-id', 'other-id')).toBe('teacher-id')
  })
  it('không chỉ định → chính người gọi', () => {
    expect(resolveSessionCreator('admin', 'admin-id')).toBe('admin-id')
  })
})
