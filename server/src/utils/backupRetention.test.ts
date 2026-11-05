import { describe, it, expect } from 'vitest'
import { backupsToDelete } from './backupRetention.js'

const NOW = Date.parse('2026-11-05T00:00:00Z')
const DAY = 24 * 3600 * 1000
const keyAt = (t: number) => `backups/db-${new Date(t).toISOString().replace(/[:.]/g, '-')}.json`
/** 2 bản/ngày, mới nhất là hôm nay. */
const twoPerDay = (days: number) => Array.from({ length: days * 2 }, (_, i) => keyAt(NOW - i * (DAY / 2)))

describe('backupsToDelete (phát hiện lỗi muộn vẫn còn bản để lấy lại)', () => {
  it('chưa quá 60 bản: không xóa gì', () => {
    expect(backupsToDelete(twoPerDay(30), NOW)).toEqual([])
  })
  it('luôn giữ 60 bản mới nhất', () => {
    const keys = twoPerDay(100)
    const gone = new Set(backupsToDelete(keys, NOW))
    expect(keys.slice(0, 60).some((k) => gone.has(k))).toBe(false)
    expect(gone.size).toBeGreaterThan(0)
  })
  it('sau 150 ngày: lỗi cách đây 4 tháng vẫn có bản mỗi tuần để lấy', () => {
    const keys = twoPerDay(150)
    const gone = new Set(backupsToDelete(keys, NOW))
    const kept = keys.filter((k) => !gone.has(k))
    expect(kept.filter((k) => k < keyAt(NOW - 100 * DAY) && k >= keyAt(NOW - 130 * DAY)).length).toBeGreaterThanOrEqual(4)
  })
  it('quá 180 ngày: mỗi tháng còn đúng 1 bản, không thời hạn', () => {
    const keys = twoPerDay(500)
    const gone = new Set(backupsToDelete(keys, NOW))
    const old = keys.filter((k) => !gone.has(k) && k < keyAt(NOW - 200 * DAY))
    const months = old.map((k) => /db-(\d{4}-\d{2})/.exec(k)![1])
    expect(new Set(months).size).toBe(months.length)
    expect(months.length).toBeGreaterThanOrEqual(9)
  })
  it('file không đọc được thời điểm: không bao giờ xóa', () => {
    const keys = [...twoPerDay(100), 'backups/ten-la.json']
    expect(backupsToDelete(keys, NOW)).not.toContain('backups/ten-la.json')
  })
})
