import { describe, it, expect } from 'vitest'
import { searchSnapshotsForDay, sessionsOfDayInSnapshot, type SnapshotSource } from './snapshotSearch.js'

const DAY = '2026-10-29'
const sess = (id: string, date: string, note = '', extra: Record<string, unknown> = {}) => ({ id, no: 1, date, homework: '', entry: { attendance: 'present', scores: {}, note }, ...extra })
const snapData = (sessions: unknown[], orphans: unknown[] = []) => ({
  classes: [
    { id: 'c7', name: 'Lớp 7', level: 'secondary', students: [{ id: 's1', name: 'Tuấn', sessions }] },
    { id: 'c8', name: 'Lớp 8', students: [{ id: 's9', name: 'Khác', sessions: [sess('x', DAY)] }] },
  ],
  orphans,
})
const src = (id: string, deviceId: string, at: string): SnapshotSource => ({ id, deviceId, createdAt: new Date(at), user: { _id: 'u', name: 'Cô A', role: 'teacher' } })

describe('sessionsOfDayInSnapshot', () => {
  it('chỉ lấy đúng lớp + đúng ngày, kèm thông tin lớp không có học sinh', () => {
    const r = sessionsOfDayInSnapshot(snapData([sess('a', DAY), sess('b', '2026-10-27')]), 'c7', DAY)
    expect(r.hits.map((h) => h.session.id)).toEqual(['a'])
    expect(r.hits[0]).toMatchObject({ studentId: 's1', studentName: 'Tuấn', inOrphans: false })
    expect(r.classMeta).toEqual({ id: 'c7', name: 'Lớp 7', level: 'secondary' })
  })
  it('tìm cả trong kho giữ lại (học sinh đã bị gỡ khỏi máy)', () => {
    const orphans = [{ classId: 'c7', studentId: 's2', studentName: 'Vũ', sessions: [sess('k', DAY)] }, { classId: 'c8', studentId: 's3', studentName: 'Z', sessions: [sess('z', DAY)] }]
    const r = sessionsOfDayInSnapshot(snapData([], orphans), 'c7', DAY)
    expect(r.hits).toHaveLength(1)
    expect(r.hits[0]).toMatchObject({ studentName: 'Vũ', inOrphans: true })
  })
  it('bản chụp hỏng/thiếu trường không làm lỗi', () => {
    for (const bad of [null, undefined, {}, { classes: [null] }, { classes: [{ id: 'c7', students: [{ id: 's', sessions: null }] }] }]) {
      expect(sessionsOfDayInSnapshot(bad, 'c7', DAY).hits).toEqual([])
    }
  })
})

describe('searchSnapshotsForDay', () => {
  it('ca thật: buổi chỉ còn trong bản CŨ, bản mới nhất đã mất → vẫn tìm thấy', async () => {
    const contents: Record<string, unknown> = { old: snapData([sess('tmp1', DAY, 'điểm thật')]), newest: snapData([]) }
    const r = await searchSnapshotsForDay([src('newest', 'm1', '2026-10-30T10:00:00Z'), src('old', 'm1', '2026-10-29T13:00:00Z')], async (id) => contents[id], 'c7', DAY)
    expect(r.versions).toHaveLength(1)
    expect((r.versions[0].session.entry as { note: string }).note).toBe('điểm thật')
    expect(r).toMatchObject({ scanned: 2, failed: 0, devices: 1 })
  })
  it('gộp bản giống hệt trên nhiều lần chụp và nhiều máy, nhớ khoảng thời gian từng máy giữ', async () => {
    const data = snapData([sess('a', DAY, 'x')])
    const r = await searchSnapshotsForDay([src('1', 'm1', '2026-10-29T13:00:00Z'), src('2', 'm1', '2026-10-30T13:00:00Z'), src('3', 'm2', '2026-10-31T13:00:00Z')], async () => data, 'c7', DAY)
    expect(r.versions).toHaveLength(1)
    const m1 = r.versions[0].sources.find((s) => s.deviceId === 'm1')!
    expect(m1.copies).toBe(2)
    expect(m1.firstAt.toISOString()).toBe('2026-10-29T13:00:00.000Z')
    expect(m1.lastAt.toISOString()).toBe('2026-10-30T13:00:00.000Z')
    expect(r.versions[0].sources).toHaveLength(2)
    expect(r.devices).toBe(2)
  })
  it('khác nội dung → giữ riêng từng bản; cờ trên máy (dirty, synced) không tách bản', async () => {
    const contents: Record<string, unknown> = {
      a: snapData([sess('1', DAY, 'bản A', { dirty: true })]),
      b: snapData([sess('1', DAY, 'bản A', { synced: true })]),
      c: snapData([sess('1', DAY, 'bản C')]),
    }
    const r = await searchSnapshotsForDay(['a', 'b', 'c'].map((id, i) => src(id, 'm', `2026-10-2${i + 7}T00:00:00Z`)), async (id) => contents[id], 'c7', DAY)
    expect(r.versions).toHaveLength(2)
  })
  it('1 bản đọc lỗi không làm hỏng lượt tìm, nhưng phải báo số lỗi', async () => {
    const r = await searchSnapshotsForDay([src('bad', 'm', '2026-10-29T00:00:00Z'), src('ok', 'm', '2026-10-30T00:00:00Z')], async (id) => {
      if (id === 'bad') throw new Error('R2 lỗi')
      return snapData([sess('a', DAY)])
    }, 'c7', DAY)
    expect(r).toMatchObject({ scanned: 2, failed: 1 })
    expect(r.versions).toHaveLength(1)
  })
  it('không có gì → rỗng, vẫn báo đã đọc bao nhiêu bản', async () => {
    const r = await searchSnapshotsForDay([src('1', 'm', '2026-10-29T00:00:00Z')], async () => snapData([]), 'c7', DAY)
    expect(r).toMatchObject({ scanned: 1, failed: 0, versions: [] })
    expect((await searchSnapshotsForDay([], async () => null, 'c7', DAY)).scanned).toBe(0)
  })
  it('lấy thông tin lớp từ bản chụp mới nhất', async () => {
    const contents: Record<string, unknown> = { o: { classes: [{ id: 'c7', name: 'Tên cũ', students: [] }] }, n: { classes: [{ id: 'c7', name: 'Tên mới', students: [] }] } }
    const r = await searchSnapshotsForDay([src('o', 'm', '2026-10-29T00:00:00Z'), src('n', 'm', '2026-10-30T00:00:00Z')], async (id) => contents[id], 'c7', DAY)
    expect(r.classMeta?.name).toBe('Tên mới')
  })
})
