import { describe, it, expect } from 'vitest'
import { attendanceDayOptions, markAttendance, dayAttendanceStats } from './quickAttendance'
import { emptyEntry } from './seed'
import type { Session } from '@/types'

const S = (id: string, no: number, date: string, extra: Partial<Session> = {}): Session => ({ id, no, date, homework: '', entry: emptyEntry(), ...extra })
const mk = () => [
  { id: 'a', name: 'An', sessions: [S('a1', 1, '2026-11-03'), S('a2', 2, '2026-11-05', { homework: 'Unit 3', maxes: { mini: 10 } })] },
  { id: 'b', name: 'Bình', sessions: [S('b1', 1, '2026-11-03')] },
  { id: 'c', name: 'Chi', sessions: [S('c1', 1, '2026-11-03'), S('c2', 2, '2026-11-05'), S('c3', 3, '2026-11-05')] },
]

describe('quickAttendance (đợt 3, 11/11)', () => {
  it('ngày cho chọn: 3 buổi gần nhất + hôm nay (đánh dấu không đúng lịch)', () => {
    const o = attendanceDayOptions(mk(), '2026-11-06')
    expect(o.slice(0, -1).map((x) => x.date)).toEqual(['2026-11-03', '2026-11-05'])
    expect(o.at(-1)).toEqual({ date: '2026-11-06', scheduled: false })
  })
  it('có buổi ngày đó → chỉ đổi điểm danh, đánh dấu chờ gửi; bấm lại đúng trạng thái → không đổi', () => {
    const st = mk()
    expect(markAttendance(st, 'b', '2026-11-03', 'late', { newId: 'x', today: '2026-11-06' })).toEqual({ ok: true, sessionId: 'b1', created: false, changed: true })
    expect(st[1].sessions[0]).toMatchObject({ dirty: true, entry: { attendance: 'late' } })
    expect(markAttendance(st, 'b', '2026-11-03', 'late', { newId: 'x', today: '2026-11-06' })).toMatchObject({ changed: false })
  })
  it('chưa có buổi → tạo buổi ngày đó, bài tập + số câu theo bạn CÙNG NGÀY, số tạm n+1', () => {
    const st = mk()
    expect(markAttendance(st, 'b', '2026-11-05', 'present', { newId: 'new', today: '2026-11-06', teacherName: 'Cô A' })).toEqual({ ok: true, sessionId: 'new', created: true, changed: true })
    expect(st[1].sessions.find((s) => s.id === 'new')).toMatchObject({ no: 2, date: '2026-11-05', homework: 'Unit 3', maxes: { mini: 10 }, dirty: true, createdByName: 'Cô A', entry: { attendance: 'present' } })
  })
  it('từ chối: ngày tương lai, em có 2 buổi cùng ngày', () => {
    expect(markAttendance(mk(), 'a', '2026-11-09', 'present', { newId: 'x', today: '2026-11-06' })).toMatchObject({ ok: false })
    const r = markAttendance(mk(), 'c', '2026-11-05', 'absent', { newId: 'x', today: '2026-11-06' })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('2 buổi cùng ngày')
  })
  it('đếm 1 ngày + ai chưa có buổi', () => {
    const st = mk()
    markAttendance(st, 'a', '2026-11-03', 'excused', { newId: 'x', today: '2026-11-06' })
    expect(dayAttendanceStats(st, '2026-11-03')).toEqual({ present: 2, late: 0, excused: 1, absent: 0, unmarked: [] })
    expect(dayAttendanceStats(st, '2026-11-05').unmarked).toEqual(['b'])
  })
})
