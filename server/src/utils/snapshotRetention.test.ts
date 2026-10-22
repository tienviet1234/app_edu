import { describe, it, expect } from 'vitest'
import { snapshotsToDelete, KEEP_RECENT } from './snapshotRetention'

const NOW = new Date('2026-10-23T12:00:00.000Z')
const MIN = 60e3
const at = (msAgo: number, id = String(msAgo)) => ({ id, createdAt: new Date(NOW.getTime() - msAgo) })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

describe('snapshotsToDelete (dọn bản chụp máy giáo viên)', () => {
  it('ít hơn 60 bản → không xóa gì', () => {
    expect(snapshotsToDelete(Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN)), NOW)).toEqual([])
  })

  it('KHÔNG BAO GIỜ xóa bản nào trong 60 bản mới nhất (cách cũ giữ gì, cách mới giữ đủ)', () => {
    // 60 bản rải 60 ngày — cách cũ giữ hết cả 60; cách mới cũng phải giữ hết.
    const snaps = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * 24 * 60 * MIN))
    expect(snapshotsToDelete([...snaps, at(100 * 24 * 60 * MIN, 'rất cũ')], NOW).map((s) => s.id)).toEqual(['rất cũ'])
  })

  it('nhập liên tục 1 phút/bản → ngoài 60 bản mới nhất, trong 3 ngày giữ bản mới nhất mỗi giờ', () => {
    const snaps = Array.from({ length: 300 }, (_, i) => at(i * MIN)) // 5 giờ, 1 bản/phút
    const del = new Set(ids(snapshotsToDelete(snaps, NOW)))
    const kept = snaps.filter((s) => !del.has(s.id))
    expect(kept.slice(0, KEEP_RECENT)).toEqual(snaps.slice(0, KEEP_RECENT))
    // Mỗi giờ (theo đồng hồ) có ít nhất 1 bản được giữ.
    const hoursAll = new Set(snaps.map((s) => Math.floor(s.createdAt.getTime() / 3600e3)))
    const hoursKept = new Set(kept.map((s) => Math.floor(s.createdAt.getTime() / 3600e3)))
    expect(hoursKept).toEqual(hoursAll)
    expect(kept.length).toBeLessThanOrEqual(KEEP_RECENT + 6)
  })

  it('bản 3–30 ngày trước → giữ bản mới nhất mỗi ngày (giờ VN), bỏ các bản khác cùng ngày', () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN))
    // 10 ngày trước, giờ VN 09:00 và 15:00 cùng 1 ngày.
    const morning = { id: 'sáng', createdAt: new Date('2026-10-13T02:00:00.000Z') }
    const afternoon = { id: 'chiều', createdAt: new Date('2026-10-13T08:00:00.000Z') }
    expect(ids(snapshotsToDelete([...recent, morning, afternoon], NOW))).toEqual(['sáng'])
  })

  it('ngày theo giờ VN: 23:30 VN và 00:30 VN hôm sau là 2 ngày khác nhau → giữ cả 2', () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN))
    const lateNight = { id: '23:30', createdAt: new Date('2026-10-12T16:30:00.000Z') }
    const nextDay = { id: '00:30', createdAt: new Date('2026-10-12T17:30:00.000Z') }
    expect(snapshotsToDelete([...recent, lateNight, nextDay], NOW)).toEqual([])
  })

  it('quá 30 ngày (ngoài 60 bản mới nhất) → xóa', () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN))
    expect(ids(snapshotsToDelete([...recent, at(31 * 24 * 60 * MIN, 'cũ')], NOW))).toEqual(['cũ'])
  })

  it('thứ tự đầu vào không quan trọng', () => {
    const snaps = Array.from({ length: 200 }, (_, i) => at(i * 7 * MIN))
    const a = ids(snapshotsToDelete(snaps, NOW)).sort()
    const b = ids(snapshotsToDelete([...snaps].reverse(), NOW)).sort()
    expect(a).toEqual(b)
  })
})
