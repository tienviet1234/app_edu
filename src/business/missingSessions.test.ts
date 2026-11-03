import { describe, it, expect } from 'vitest'
import { findMissingSessions, recentMissingDays } from './missingSessions'

const many = (ids: string[], dates: string[]) => ids.flatMap((studentId) => dates.map((date) => ({ studentId, date })))

describe('recentMissingDays (cảnh báo admin ngay khi mở app)', () => {
  // Lớp 7 thật: học thứ 3/5/7, ngày 29/10 chỉ 3/11 em có buổi.
  const ids = Array.from({ length: 11 }, (_, i) => `s${i}`)
  const REGULAR = ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20', '2026-10-22', '2026-10-24', '2026-10-27']
  const sessions = [...many(ids, REGULAR), ...many(['s0', 's1', 's2'], ['2026-10-29']), ...many(ids, ['2026-10-31'])]
  const report = findMissingSessions(ids, sessions, '2026-11-03')

  it('ca thật Lớp 7: báo 29/10 thiếu đúng 8 em dù 3/11 em có buổi', () => {
    const days = recentMissingDays(report, '2026-11-03')
    const d = days.find((x) => x.date === '2026-10-29')
    expect(d?.studentIds).toHaveLength(8)
    expect(d?.wholeClass).toBe(false)
    expect(d?.studentIds).not.toContain('s0')
  })

  it('không báo HÔM NAY (lớp có thể chưa học / chưa nhập xong), báo hôm qua', () => {
    const r = findMissingSessions(ids, many(ids, REGULAR), '2026-10-29')
    expect(recentMissingDays(r, '2026-10-29').map((d) => d.date)).not.toContain('2026-10-29')
    const next = findMissingSessions(ids, many(ids, REGULAR), '2026-10-30')
    expect(recentMissingDays(next, '2026-10-30').map((d) => d.date)).toContain('2026-10-29')
  })

  it('cả lớp không có buổi đúng lịch → đánh dấu wholeClass', () => {
    const r = findMissingSessions(ids, many(ids, REGULAR), '2026-10-30')
    expect(recentMissingDays(r, '2026-10-30').find((d) => d.date === '2026-10-29')).toMatchObject({ wholeClass: true })
  })

  it('ngày cũ hơn khoảng cảnh báo không hiện; ngày admin đã ẩn (lớp nghỉ) không hiện', () => {
    const later = findMissingSessions(ids, sessions, '2026-12-01')
    expect(recentMissingDays(later, '2026-12-01', 14).map((d) => d.date)).not.toContain('2026-10-29')
    expect(recentMissingDays(report, '2026-11-03', 14, new Set(['2026-10-29'])).map((d) => d.date)).not.toContain('2026-10-29')
  })

  it('mới nhất trước; không thiếu gì → rỗng', () => {
    const r = { classDays: [], noOneDays: ['2026-10-20'], byStudent: [{ studentId: 'a', missing: ['2026-10-22', '2026-10-20'], noSessions: false }] }
    expect(recentMissingDays(r, '2026-10-25').map((d) => d.date)).toEqual(['2026-10-22', '2026-10-20'])
    expect(recentMissingDays({ classDays: [], noOneDays: [], byStudent: [] }, '2026-10-25')).toEqual([])
  })
})

describe('findMissingSessions', () => {
  // Lớp học thứ 7 + chủ nhật (như Lớp 3/4/5)
  const WEEKEND = ['2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04', '2026-10-10', '2026-10-11']

  it('Lớp 4 thật: 17/10 chỉ 3/9 em có, 18/10 chỉ 5/9 → vẫn là ngày lớp học, báo đúng em thiếu', () => {
    const ids = Array.from({ length: 9 }, (_, i) => `s${i}`)
    const sessions = [
      ...many(ids, WEEKEND),
      ...many(['s0', 's1', 's8'], ['2026-10-17']),
      ...many(['s2', 's4', 's5', 's6', 's8'], ['2026-10-18']),
    ]
    const r = findMissingSessions(ids, sessions, '2026-10-20')
    expect(r.classDays).toContain('2026-10-17')
    expect(r.classDays).toContain('2026-10-18')
    expect(r.byStudent.find((x) => x.studentId === 's3')?.missing).toEqual(['2026-10-17', '2026-10-18'])
    expect(r.byStudent.find((x) => x.studentId === 's0')?.missing).toEqual(['2026-10-18'])
    expect(r.byStudent.find((x) => x.studentId === 's8')).toBeUndefined()
  })

  it('Lớp 3 thật: 17/10 chỉ 1/6 em có (dưới ngưỡng) nhưng đúng THỨ học đều đặn → vẫn bắt được 5 em thiếu', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f']
    const sessions = [...many(ids, WEEKEND), { studentId: 'a', date: '2026-10-17' }, ...many(ids, ['2026-10-18'])]
    const r = findMissingSessions(ids, sessions, '2026-10-19')
    expect(r.classDays).toContain('2026-10-17')
    expect(r.byStudent.map((x) => x.studentId).sort()).toEqual(['b', 'c', 'd', 'e', 'f'])
  })

  it('Lớp 10 thật: học thứ 3/5/7, cả lớp KHÔNG ai có buổi sau 10/10 → báo các ngày 13, 15, 17, 20/10', () => {
    const ids = ['x', 'y', 'z']
    const TTS = ['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-08', '2026-10-10']
    const r = findMissingSessions(ids, many(ids, TTS), '2026-10-20')
    expect(r.noOneDays).toEqual(['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20'])
  })

  it('học sinh vào lớp giữa chừng → chỉ tính từ buổi đầu tiên của em đó', () => {
    const ids = ['a', 'b', 'late']
    const sessions = [...many(['a', 'b'], WEEKEND), ...many(['late'], ['2026-10-10', '2026-10-11'])]
    const r = findMissingSessions(ids, sessions, '2026-10-11')
    expect(r.byStudent.find((x) => x.studentId === 'late')).toBeUndefined()
  })

  it('học sinh chưa có buổi nào → báo riêng', () => {
    const r = findMissingSessions(['a', 'b', 'new'], many(['a', 'b'], WEEKEND), '2026-10-11')
    expect(r.byStudent.find((x) => x.studentId === 'new')?.noSessions).toBe(true)
  })

  it('buổi tương lai (lỡ tạo trước) không tính', () => {
    const r = findMissingSessions(['a', 'b'], [...many(['a', 'b'], WEEKEND), ...many(['a', 'b'], ['2026-10-31'])], '2026-10-11')
    expect(r.classDays).not.toContain('2026-10-31')
  })
})
