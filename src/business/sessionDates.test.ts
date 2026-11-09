import { describe, expect, it } from 'vitest'
import { dateChangeCheck } from './sessionDates'

// Lớp 7 thu nhỏ: học thứ 3-5-7, đủ lớp các ngày 20/10, 22/10, 29/10.
const lop7 = ['Kim Phụng', 'Vương Thắng', 'Tuấn', 'Hoàng', 'Vũ'].map((name, i) => ({
  id: `st${i}`, name,
  sessions: ['2026-10-20', '2026-10-22', '2026-10-29'].map((date, k) => ({ id: `s${i}-${k}`, date })),
}))

describe('dateChangeCheck (đổi ngày / thêm buổi tay)', () => {
  it('sự cố Lớp 7: đổi buổi 29/10 của Kim Phụng sang 24/10 (lớp không học) → hỏi lại, nêu các ngày lớp học gần đó', () => {
    const r = dateChangeCheck(lop7, 'st0', 's0-2', '2026-10-24')
    expect(r.block).toBeUndefined()
    expect(r.confirm).toContain('24/10')
    expect(r.confirm).toContain('HỌC BÙ RIÊNG của Kim Phụng')
    expect(r.confirm).toContain('22/10')
  })
  it('ca Linh Đan: đổi sang ngày em đã có buổi khác → chặn', () => {
    expect(dateChangeCheck(lop7, 'st0', 's0-2', '2026-10-22').block).toContain('22/10')
  })
  it('đổi sang ngày cả lớp có học (sửa nhầm ngày thường gặp) → không hỏi', () => {
    const moved = lop7.map((s, i) => (i === 0 ? { ...s, sessions: s.sessions.slice(0, 2) } : s))
    expect(dateChangeCheck(moved, 'st0', 's0-1', '2026-10-29')).toEqual({})
  })
  it('giữ nguyên ngày của chính buổi đó → không chặn chính nó', () => expect(dateChangeCheck(lop7, 'st0', 's0-1', '2026-10-22')).toEqual({}))
  it('đã có em khác cùng ngày (học bù chung) → không hỏi', () => {
    const withMakeup = lop7.map((s, i) => (i === 1 ? { ...s, sessions: [...s.sessions, { id: 'mk', date: '2026-10-24' }] } : s))
    expect(dateChangeCheck(withMakeup, 'st0', 's0-2', '2026-10-24')).toEqual({})
  })
  it('lớp nhỏ (≤ 3 em) hoặc chưa có ngày học đông gần đó → không hỏi', () => {
    expect(dateChangeCheck(lop7.slice(0, 3), 'st0', 's0-2', '2026-10-24')).toEqual({})
    expect(dateChangeCheck(lop7, 'st0', 's0-2', '2026-12-24')).toEqual({})
  })
  it('đang gõ dở năm (0202-10-24) → không hỏi, không chặn', () => expect(dateChangeCheck(lop7, 'st0', 's0-2', '0202-10-24')).toEqual({}))
  it('thêm buổi tay (chưa có id) vào ngày em đã có → chặn', () => expect(dateChangeCheck(lop7, 'st0', null, '2026-10-20').block).toBeTruthy())
})
