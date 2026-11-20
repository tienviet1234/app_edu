import { describe, it, expect } from 'vitest'
import { unsyncedDetailsOf, describeUnsynced, stuckSinceOf } from './snapshotDetails.js'

const OID = 'a'.repeat(24)
const snap = (sessions: Array<Record<string, unknown>>) => ({ classes: [{ id: 'c'.repeat(24), name: 'Lớp 7', students: [{ id: 'f'.repeat(24), name: 'Tuấn', sessions }] }] })

describe('unsyncedDetailsOf (bản chụp máy → buổi chưa lên server)', () => {
  it('lấy buổi id tạm + buổi sửa chưa gửi, bỏ buổi đã khớp server', () => {
    const d = unsyncedDetailsOf(snap([
      { id: OID, no: 1, date: '2026-10-08', entry: {} },
      { id: 'tmp-1', no: 2, date: '2026-10-10', entry: { attendance: 'present', scores: {} } },
      { id: 'b'.repeat(24), no: 3, date: '2026-10-12', dirty: true, entry: { scores: { mini: 8 } } },
    ]))
    expect(d).toEqual([
      { classId: 'c'.repeat(24), className: 'Lớp 7', studentId: 'f'.repeat(24), studentName: 'Tuấn', sessionId: 'tmp-1', no: 2, date: '2026-10-10', kind: 'temp', hasData: false, conflict: false },
      { classId: 'c'.repeat(24), className: 'Lớp 7', studentId: 'f'.repeat(24), studentName: 'Tuấn', sessionId: 'b'.repeat(24), no: 3, date: '2026-10-12', kind: 'dirty', hasData: true, conflict: false },
    ])
  })
  it('có dữ liệu = vắng / ghi chú / bài tập / điểm', () => {
    const one = (s: Record<string, unknown>) => unsyncedDetailsOf(snap([{ id: 'tmp', date: '2026-10-10', ...s }]))[0].hasData
    expect(one({ entry: { attendance: 'excused' } })).toBe(true)
    expect(one({ entry: { note: ' x ' } })).toBe(true)
    expect(one({ homework: 'Unit 1', entry: {} })).toBe(true)
    expect(one({ entry: { ticks: { a: ['x'] } } })).toBe(true)
    expect(one({ entry: { attendance: 'present', note: '  ' } })).toBe(false)
  })
  it('dữ liệu hỏng / rỗng không làm lỗi', () => {
    expect(unsyncedDetailsOf(null)).toEqual([])
    expect(unsyncedDetailsOf({ classes: [{}] })).toEqual([])
  })
  it('tối đa 50 dòng', () => {
    expect(unsyncedDetailsOf(snap(Array.from({ length: 80 }, (_, i) => ({ id: `tmp-${i}`, date: '2026-10-10' }))))).toHaveLength(50)
  })
})

describe('describeUnsynced (lời báo cho admin)', () => {
  const base = { classId: 'c', className: 'Lớp 7', studentId: 's', studentName: 'Tuấn', sessionId: 'tmp', no: 2, date: '2026-10-10', kind: 'temp' as const, hasData: false, conflict: false }
  it('mỗi loại 1 lời khuyên đúng việc', () => {
    expect(describeUnsynced(base, true)).toContain('Lớp 7 · Tuấn · 10/10: bản thừa trùng ngày')
    expect(describeUnsynced(base, false)).toContain('buổi TRỐNG chỉ có trên máy')
    expect(describeUnsynced({ ...base, hasData: true }, false)).toContain('có dữ liệu chưa lên server')
    expect(describeUnsynced({ ...base, kind: 'dirty' }, true)).toContain('đã sửa trên máy, chưa gửi')
    expect(describeUnsynced({ ...base, conflict: true }, true)).toContain('2 máy cùng sửa')
  })
})

describe('stuckSinceOf (máy kẹt từ lúc nào)', () => {
  const at = (d: string, n: number) => ({ createdAt: new Date(d), unsyncedSessionCount: n })
  it('bản chụp đầu tiên sau lần cuối về 0', () => {
    expect(stuckSinceOf([at('2026-11-19', 3), at('2026-11-10', 4), at('2026-11-01', 3), at('2026-10-30', 0), at('2026-10-20', 5)]))
      .toBe(new Date('2026-11-01').getTime())
  })
  it('chưa từng về 0 → bản cũ nhất còn giữ; đang 0 → null', () => {
    expect(stuckSinceOf([at('2026-11-19', 3), at('2026-10-20', 5)])).toBe(new Date('2026-10-20').getTime())
    expect(stuckSinceOf([at('2026-11-19', 0), at('2026-10-20', 5)])).toBeNull()
    expect(stuckSinceOf([])).toBeNull()
  })
})
