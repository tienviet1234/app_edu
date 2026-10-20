import { describe, it, expect } from 'vitest'
import { localISODate } from './format'

describe('localISODate (ngày mặc định khi tạo buổi mới)', () => {
  it('0:30 sáng 21/10 theo giờ máy → 21/10 (trước đây dùng UTC → ra 20/10 ở VN, buổi bị lùi 1 ngày)', () => {
    expect(localISODate(new Date(2026, 9, 21, 0, 30))).toBe('2026-10-21')
  })
  it('6:59 sáng vẫn đúng ngày', () => {
    expect(localISODate(new Date(2026, 9, 18, 6, 59))).toBe('2026-10-18')
  })
  it('23:59 tối vẫn đúng ngày', () => {
    expect(localISODate(new Date(2026, 9, 17, 23, 59))).toBe('2026-10-17')
  })
  it('đầu tháng/đầu năm có số 0 đứng trước', () => {
    expect(localISODate(new Date(2027, 0, 5, 1, 0))).toBe('2027-01-05')
  })
})
