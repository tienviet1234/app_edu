import { describe, it, expect } from 'vitest'
import { classGrid } from './classGrid'
import { emptyEntry } from './seed'
import type { Session } from '@/types'

const sess = (id: string, date: string, attendance: Session['entry']['attendance'] = 'present', total?: number): Session & { _t?: number } =>
  ({ id, no: 1, date, homework: '', entry: { ...emptyEntry(), attendance }, _t: total })

describe('classGrid (lưới cả lớp, 11/11)', () => {
  const dates = ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12']
  const students = [
    { id: 'a', name: 'An', sessions: dates.slice(0, 7).map((d, i) => sess(`a${i}`, d, i === 6 ? 'late' : 'present', 60 + i)) },
    { id: 'b', name: 'Bình', sessions: [...dates.slice(0, 5).map((d, i) => sess(`b${i}`, d, i === 4 ? 'excused' : 'present', i === 4 ? undefined : 80)), sess('bx', '2026-11-07')] },
    { id: 'c', name: 'Chi', sessions: [] },
  ]
  const score = (s: Session) => ((s as Session & { _t?: number })._t ?? null)
  const g = classGrid(students, '2026-11-10', score)

  it('7 buổi gần nhất tới hôm nay (không lấy buổi tương lai), có cả ngày chỉ 1 em có buổi', () => {
    expect(g.days).toEqual(['2026-10-22', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-07', '2026-11-10'])
    expect(g.dayCounts['2026-11-07']).toBe(1)
    expect(g.dayCounts['2026-10-27']).toBe(2)
  })
  it('ô = điểm danh + tổng điểm; em chưa có buổi ngày đó → không có ô', () => {
    const a = g.rows.find((r) => r.studentId === 'a')!
    expect(a.cells['2026-11-10']).toMatchObject({ attendance: 'late', total: 66, sessionId: 'a6' })
    expect(g.rows.find((r) => r.studentId === 'b')!.cells['2026-11-10']).toBeUndefined()
    expect(g.rows.find((r) => r.studentId === 'c')!.cells).toEqual({})
  })
  it('đi học = có mặt + muộn; điểm TB bỏ buổi chưa chấm / vắng có phép (không tính 0)', () => {
    const a = g.rows.find((r) => r.studentId === 'a')!
    expect(a.attended).toBe(6) // 6 ngày trong lưới có buổi (20/10 nằm ngoài 7 buổi gần nhất)
    expect(a.avg).toBe(Math.round((61 + 62 + 63 + 64 + 65 + 66) / 6))
    const b = g.rows.find((r) => r.studentId === 'b')!
    expect(b.attended).toBe(4) // 22/10, 27/10, 29/10 có mặt + 07/11 có mặt; 03/11 vắng có phép
    expect(b.avg).toBe(80)
  })
})
