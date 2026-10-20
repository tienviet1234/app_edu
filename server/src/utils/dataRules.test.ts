import { describe, it, expect } from 'vitest'
import { decideIfAbsent, isStudentInClass, resolveScoreClassId, resolveSessionCreator } from './dataRules.js'

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
