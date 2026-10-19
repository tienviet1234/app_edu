import { describe, it, expect } from 'vitest'
import { sortSessionsByDate, sequentialNumbering } from './resequence'

interface S { id: string; date: string; no: number }

describe('sortSessionsByDate', () => {
  it('sắp đúng theo ngày tăng dần', () => {
    const sessions: S[] = [
      { id: 'c', date: '2026-09-17', no: 3 },
      { id: 'a', date: '2026-09-12', no: 1 },
      { id: 'b', date: '2026-09-15', no: 2 },
    ]
    expect(sortSessionsByDate(sessions).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('cùng ngày thì giữ ổn định theo no hiện tại', () => {
    const sessions: S[] = [
      { id: 'y', date: '2026-10-08', no: 16 },
      { id: 'x', date: '2026-10-08', no: 15 },
    ]
    expect(sortSessionsByDate(sessions).map((s) => s.id)).toEqual(['x', 'y'])
  })
})

describe('sequentialNumbering', () => {
  it('danh sách đã đúng thứ tự thì giữ nguyên số (1..N liên tục)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-12', no: 1 },
      { id: 'b', date: '2026-09-15', no: 2 },
      { id: 'c', date: '2026-09-17', no: 3 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('xếp lại đúng khi số buổi bị xáo trộn (kịch bản thật — Lớp 7, Vương Thắng)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-15', no: 4 },
      { id: 'b', date: '2026-09-19', no: 3 },
      { id: 'c', date: '2026-09-22', no: 7 },
      { id: 'd', date: '2026-09-24', no: 5 },
      { id: 'e', date: '2026-09-26', no: 6 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 })
  })

  it('đóng khoảng trống khi 1 buổi ở giữa bị xóa (không bỏ số, VD 7 rồi nhảy 9)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-01', no: 7 },
      { id: 'b', date: '2026-09-03', no: 9 },
      { id: 'c', date: '2026-09-05', no: 10 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('gỡ số TẠM bị kẹt (dải +1000 từ applySafely lỗi mạng giữa chừng)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-12', no: 1014 },
      { id: 'b', date: '2026-09-15', no: 4 },
      { id: 'c', date: '2026-09-17', no: 5 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('mảng rỗng trả về object rỗng', () => {
    expect(sequentialNumbering([])).toEqual({})
  })

  it('1 buổi duy nhất luôn thành Buổi 1', () => {
    expect(sequentialNumbering([{ id: 'a', date: '2026-09-12', no: 99 }])).toEqual({ a: 1 })
  })
})
