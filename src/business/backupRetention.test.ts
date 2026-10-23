import { describe, it, expect } from 'vitest'
import { backupsToDelete, KEEP_RECENT } from './backupRetention'

const NOW = Date.parse('2026-10-23T12:00:00.000Z')
const MIN = 60e3
const DAY = 24 * 60 * MIN
const at = (msAgo: number, id = String(msAgo)) => ({ id, at: NOW - msAgo })
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id)

describe('backupsToDelete (dọn bản sao lưu trên máy)', () => {
  it('ít hơn 60 bản → không xóa gì', () => {
    expect(backupsToDelete(Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN)), NOW)).toEqual([])
  })
  it('KHÔNG BAO GIỜ xóa bản nào trong 60 bản mới nhất, kể cả rất cũ', () => {
    const snaps = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * DAY))
    expect(ids(backupsToDelete([...snaps, at(100 * DAY, 'rất cũ')], NOW))).toEqual(['rất cũ'])
  })
  it('chụp liên tục 1 phút/bản → mỗi giờ trong 3 ngày còn ít nhất 1 bản', () => {
    const snaps = Array.from({ length: 300 }, (_, i) => at(i * MIN))
    const del = new Set(ids(backupsToDelete(snaps, NOW)))
    const kept = snaps.filter((s) => !del.has(s.id))
    const hour = (s: { at: number }) => Math.floor(s.at / 3600e3)
    expect(new Set(kept.map(hour))).toEqual(new Set(snaps.map(hour)))
    expect(kept.length).toBeLessThanOrEqual(KEEP_RECENT + 6)
  })
  it('3–30 ngày trước → giữ bản mới nhất mỗi ngày (giờ VN)', () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN))
    const morning = { id: 'sáng', at: Date.parse('2026-10-13T02:00:00.000Z') }
    const afternoon = { id: 'chiều', at: Date.parse('2026-10-13T08:00:00.000Z') }
    expect(ids(backupsToDelete([...recent, morning, afternoon], NOW))).toEqual(['sáng'])
  })
  it('quá 30 ngày (ngoài 60 bản mới nhất) → xóa', () => {
    const recent = Array.from({ length: KEEP_RECENT }, (_, i) => at(i * MIN))
    expect(ids(backupsToDelete([...recent, at(31 * DAY, 'cũ')], NOW))).toEqual(['cũ'])
  })
})
