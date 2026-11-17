import { describe, it, expect } from 'vitest'
import { orderSessionRowsForExport } from './exportOrder'

const R = (studentName: string, date: string, sortNo = 0, status = '') => ({ studentName, date, sortNo, status })
const T = (studentName: string) => ({ studentName, date: '', sortNo: 0, status: 'TỔNG CỘNG' })

describe('orderSessionRowsForExport — bộ đếm buổi theo ngày tháng năm (17/11)', () => {
  it('buổi có số không khớp ngày → xếp theo ngày, STT 1..n theo ngày', () => {
    const out = orderSessionRowsForExport([R('An', '2026-11-05', 3), R('An', '2026-11-03', 4), R('An', '2026-11-07', 5)])
    expect(out.map((r) => [r.date, r.seq])).toEqual([['2026-11-03', 1], ['2026-11-05', 2], ['2026-11-07', 3]])
  })
  it('qua năm mới: 30/12/2026 trước 03/01/2027 (so đủ năm, không so ngày/tháng)', () => {
    const out = orderSessionRowsForExport([R('An', '2027-01-03', 9), R('An', '2026-12-30', 8)])
    expect(out.map((r) => r.date)).toEqual(['2026-12-30', '2027-01-03'])
  })
  it('cùng ngày → theo số buổi; dòng TỔNG CỘNG luôn cuối kỳ, không đếm STT', () => {
    const out = orderSessionRowsForExport([R('An', '2026-11-05', 2), R('An', '2026-11-05', 1), T('An')])
    expect(out.map((r) => [r.sortNo, r.status, r.seq])).toEqual([[1, '', 1], [2, '', 2], [0, 'TỔNG CỘNG', '']])
  })
  it('nhiều kỳ của 1 em (mỗi kỳ có TỔNG CỘNG riêng) → kỳ sớm trước, STT đếm liền qua các kỳ; mỗi em 1 cụm', () => {
    const rows = [
      R('An', '2026-11-10'), R('An', '2026-11-12'), T('An'),
      R('Bình', '2026-10-01'), T('Bình'),
      R('An', '2026-10-20'), R('An', '2026-10-15'), T('An'),
    ]
    const out = orderSessionRowsForExport(rows)
    expect(out.map((r) => [r.studentName, r.date, r.seq])).toEqual([
      ['An', '2026-10-15', 1], ['An', '2026-10-20', 2], ['An', '', ''],
      ['An', '2026-11-10', 3], ['An', '2026-11-12', 4], ['An', '', ''],
      ['Bình', '2026-10-01', 1], ['Bình', '', ''],
    ])
  })
  it('không làm mất hay thêm dòng', () => {
    const rows = [R('A', '2026-11-02'), R('B', '2026-11-01'), R('A', '2026-11-01'), T('A')]
    expect(orderSessionRowsForExport(rows)).toHaveLength(rows.length)
  })
})
