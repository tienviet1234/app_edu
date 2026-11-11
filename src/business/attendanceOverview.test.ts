import { describe, it, expect } from 'vitest'
import { attendanceOverview, cellKind, rangeDays, type OverviewSession } from './attendanceOverview'

describe('rangeDays', () => {
  it('14 ngày tới hôm nay; tuần này từ thứ 2; tháng này từ ngày 1', () => {
    expect(rangeDays('14', '2026-11-09')).toHaveLength(14)
    expect(rangeDays('14', '2026-11-09')[0]).toBe('2026-10-27')
    expect(rangeDays('week', '2026-11-09')).toEqual(['2026-11-09']) // 09/11 là thứ 2
    expect(rangeDays('week', '2026-11-11')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
    expect(rangeDays('month', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })
})

describe('cellKind', () => {
  it('đủ lớp / còn em chưa có buổi / chỉ 1–2 em; lớp 2 em đủ 2/2 vẫn là đủ lớp', () => {
    expect(cellKind(7, 7)).toBe('full')
    expect(cellKind(6, 7)).toBe('partial')
    expect(cellKind(1, 7)).toBe('lonely')
    expect(cellKind(2, 2)).toBe('full')
    expect(cellKind(1, 2)).toBe('partial')
    expect(cellKind(2, 14)).toBe('lonely')
    expect(cellKind(3, 14)).toBe('partial')
  })
})

describe('attendanceOverview', () => {
  // Lớp học thứ 3 + thứ 5, 4 em; 3 tuần.
  const cls = { id: 'c1', name: 'Lớp 7', teacherName: 'Cô A', students: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase() })) }
  const S = (studentId: string, date: string, attendance: OverviewSession['attendance'] = 'present', total: number | null = 70): OverviewSession => ({ classId: 'c1', studentId, date, attendance, total })
  const days = ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05']
  const sessions: OverviewSession[] = [
    ...['a', 'b', 'c', 'd'].flatMap((st) => days.slice(0, 4).map((d) => S(st, d))),
    S('a', '2026-11-03', 'absent', null), S('b', '2026-11-03', 'present', 80), S('c', '2026-11-03', 'late', null),
    S('a', '2026-11-04'), // 1/4 em vào ngày không có lịch → chỉ 1 em
    S('zz', '2026-11-03'), // em đã rời lớp: không tính
    // 05/11 (thứ 5) cả lớp không ai có buổi
  ]
  const view = rangeDays('14', '2026-11-06')
  const r = attendanceOverview({ classes: [cls], sessions }, view, '2026-11-06')
  const row = r.rows[0]

  it('ô từng ngày: đủ lớp, còn em chưa có buổi, chỉ 1 em, có lịch mà chưa có buổi', () => {
    expect(row.cells['2026-10-27']).toMatchObject({ kind: 'full', count: 4, roster: 4, avg: 70 })
    expect(row.cells['2026-11-03']).toMatchObject({ kind: 'partial', count: 3, avg: 80 })
    expect(row.cells['2026-11-04']).toMatchObject({ kind: 'lonely', count: 1, studentNames: ['A'] })
    expect(row.cells['2026-11-05']).toMatchObject({ kind: 'missing', count: 0 })
    expect(row.cells['2026-11-01']).toBeUndefined()
  })
  it('đi học %: có mặt + muộn / đã điểm danh; điểm TB chỉ tính buổi đã chấm; vắng KP', () => {
    // trong 14 ngày (24/10–06/11): 27/10, 29/10 đủ 4 em (8 có mặt) + 03/11 (có mặt, muộn, vắng) + 04/11 có mặt
    expect(row.attendRate).toBe(Math.round((8 + 2 + 1) / 12 * 100))
    expect(row.avgScore).toBe(Math.round((70 * 8 + 80 + 70) / 10))
    expect(row.unexcused).toBe(1)
  })
  it('cần xử lý: ngày có lịch mà chưa có buổi + ngày chỉ 1–2 em, ngày gần nhất lên trước', () => {
    expect(r.todos.map((x) => [x.kind, x.dates])).toEqual([['missing', ['2026-11-05']], ['lonely', ['2026-11-04']]])
    expect(r.todos[0].text).toContain('T5 05/11')
    expect(r.todos[1].text).toContain('chỉ A có buổi (1/4 em)')
  })
  it('hôm nay đúng lịch → nằm trong "hôm nay có lịch" kèm số em đã có buổi', () => {
    expect(attendanceOverview({ classes: [cls], sessions }, view, '2026-11-05').todayClasses).toEqual([{ className: 'Lớp 7', count: 0, roster: 4 }])
    expect(r.todayClasses).toEqual([])
  })
})
