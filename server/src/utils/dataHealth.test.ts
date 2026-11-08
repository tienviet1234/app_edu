import { describe, it, expect } from 'vitest'
import { morningAlertFrom, summarizeDataHealth, suspectInherited, type HealthInput } from './dataHealth.js'

describe('morningAlertFrom (chuông buổi sáng chỉ kêu khi cần xử lý ngay)', () => {
  const item = (level: 'ok' | 'warn' | 'bad', title = 'Mục') => ({ key: title, level, title, detail: 'chi tiết ' + title })
  it('mọi mục ổn hoặc chỉ "cần xem" → không gửi', () => {
    expect(morningAlertFrom({ items: [item('ok'), item('warn')] })).toBeNull()
  })
  it('có mục "cần xử lý ngay" → gửi đúng các mục đó, không kèm mục khác', () => {
    const r = morningAlertFrom({ items: [item('ok', 'A'), item('warn', 'B'), item('bad', 'Sao lưu database')] })!
    expect(r.body).toContain('Sao lưu database: chi tiết Sao lưu database')
    expect(r.body).not.toContain('chi tiết B')
    expect(r.body).toContain('Sức khỏe dữ liệu')
  })
  it('nội dung không vượt giới hạn của thông báo', () => {
    const long = { key: 'x', level: 'bad' as const, title: 'x', detail: 'y'.repeat(5000) }
    expect(morningAlertFrom({ items: [long] })!.body.length).toBeLessThanOrEqual(2000)
  })
})

describe('suspectInherited (bài tập, số câu nghi lấy nhầm từ ngày khác)', () => {
  const s = (studentName: string, date: string, notes = '', maxes?: Record<string, number>) => ({ className: 'Lớp 10', studentName, date, notes, maxes })
  const day1 = [s('A', '2026-10-01', 'Trang 1', { mini: 15 }), s('B', '2026-10-01', 'Trang 1', { mini: 15 })]
  it('khác cả lớp hôm đó và trùng cả lớp ngày khác → nghi', () => {
    const r = suspectInherited([...day1, s('C', '2026-10-03', 'Trang 2'), s('D', '2026-10-03', 'Trang 2'), s('E', '2026-10-03', 'Trang 1')])
    expect(r).toEqual(['Lớp 10 · E · 2026-10-03: bài tập giống ngày 2026-10-01, khác cả lớp hôm đó'])
  })
  it('số câu cũng vậy', () => {
    const r = suspectInherited([...day1, s('C', '2026-10-03', '', { mini: 23 }), s('D', '2026-10-03', '', { mini: 23 }), s('E', '2026-10-03', '', { mini: 15 })])
    expect(r[0]).toContain('E · 2026-10-03: số câu giống ngày 2026-10-01')
  })
  it('em làm bài riêng, không trùng ngày nào → không nghi', () => {
    expect(suspectInherited([...day1, s('C', '2026-10-03', 'Trang 2'), s('D', '2026-10-03', 'Trang 2'), s('E', '2026-10-03', 'Bài riêng')])).toEqual([])
  })
  it('ngày chỉ có 1 em ghi thì chưa có "cả lớp" để so → không nghi', () => {
    expect(suspectInherited([...day1, s('E', '2026-10-03', 'Trang 1')])).toEqual([])
  })
  it('để trống → không nghi; khác lớp → không so chéo', () => {
    expect(suspectInherited([...day1, s('C', '2026-10-03', 'Trang 2'), s('D', '2026-10-03', 'Trang 2'), s('E', '2026-10-03', '')])).toEqual([])
    const other = { className: 'Lớp 9', studentName: 'X', date: '2026-10-03', notes: 'Trang 1' }
    expect(suspectInherited([...day1, s('C', '2026-10-03', 'Trang 2'), s('D', '2026-10-03', 'Trang 2'), other])).toEqual([])
  })
})

const NOW = Date.parse('2026-11-05T08:00:00Z')
const HOUR = 3600e3
const healthy: HealthInput = {
  now: NOW, latestBackupAt: NOW - 5 * HOUR, backupCount: 60, usedBytes: 50 * 1048576, limitBytes: 512 * 1048576,
  devices: [{ label: 'Cô A', unsent: 0, lastSeenAt: NOW }], rejected: [], clicksWithoutSession: [],
  sameDatePairs: [], futureSessions: [], scoresWithoutSession: 0, scoresOnDeletedSession: 0, stuckNumbers: 0, snapshotFailures: 0, suspectInherited: [], billedMismatches: [],
}
const item = (over: Partial<HealthInput>, key: string) => summarizeDataHealth({ ...healthy, ...over }).items.find((i) => i.key === key)!

describe('summarizeDataHealth', () => {
  it('mọi lớp ổn → mức ok', () => {
    expect(summarizeDataHealth(healthy).level).toBe('ok')
  })
  it('sao lưu trễ quá 36 giờ → nghiêm trọng; chưa đọc được kho → không kết luận là ổn', () => {
    expect(item({ latestBackupAt: NOW - 37 * HOUR }, 'backup').level).toBe('bad')
    expect(item({ latestBackupAt: NOW - 30 * HOUR }, 'backup').level).toBe('ok')
    expect(item({ latestBackupAt: undefined }, 'backup').level).toBe('warn')
    expect(item({ latestBackupAt: null }, 'backup').level).toBe('bad')
  })
  it('database sắp đầy (đầy là mọi lần lưu đều hỏng) → cảnh báo sớm', () => {
    expect(item({ usedBytes: 340 * 1048576 }, 'capacity').level).toBe('warn')
    expect(item({ usedBytes: 450 * 1048576 }, 'capacity').level).toBe('bad')
  })
  it('máy có buổi chưa gửi hơn 1 ngày không mở → cảnh báo; máy vừa dùng thì chỉ ghi nhận', () => {
    expect(item({ devices: [{ label: 'Cô A', unsent: 2, lastSeenAt: NOW - 30 * HOUR }] }, 'devices').level).toBe('warn')
    const r = item({ devices: [{ label: 'Cô A', unsent: 2, lastSeenAt: NOW - HOUR }] }, 'devices')
    expect(r.level).toBe('ok')
    expect(r.lines?.[0]).toContain('Cô A: 2 buổi')
  })
  it('ca thật Lớp 7: gom theo lượt, nêu đúng tên em', () => {
    const r = item({ clicksWithoutSession: [
      { date: '2026-10-29', className: 'Lớp 7', studentName: 'Tuấn' },
      { date: '2026-10-29', className: 'Lớp 7', studentName: 'Vũ' },
    ] }, 'clicks')
    expect(r.level).toBe('warn')
    expect(r.lines).toEqual(['2026-10-29 Lớp 7: Tuấn, Vũ'])
  })
  it('từ chối vì xung đột là bình thường; dữ liệu sai dạng hoặc ghi vào buổi đã xóa thì cảnh báo', () => {
    expect(item({ rejected: [{ code: 'CONFLICT', count: 3 }] }, 'rejected').level).toBe('ok')
    expect(item({ rejected: [{ code: 'VALIDATION', count: 1 }] }, 'rejected').level).toBe('warn')
  })
  it('điểm mồ côi hoặc kẹt số tạm → nghiêm trọng', () => {
    expect(item({ scoresWithoutSession: 1 }, 'integrity').level).toBe('bad')
    expect(item({ stuckNumbers: 2 }, 'integrity').level).toBe('bad')
    expect(item({ scoresOnDeletedSession: 16 }, 'integrity').level).toBe('ok')
  })
  it('phiếu học phí lệch dấu đã thu → cần xem, nêu đúng em', () => {
    const r = item({ billedMismatches: ['Lớp 2 · Tường Yên: phiếu thu 8, dấu 6'] }, 'billed')
    expect(r.level).toBe('warn')
    expect(r.lines).toEqual(['Lớp 2 · Tường Yên: phiếu thu 8, dấu 6'])
  })
  it('mức chung lấy theo mục nặng nhất', () => {
    expect(summarizeDataHealth({ ...healthy, futureSessions: ['x'] }).level).toBe('warn')
    expect(summarizeDataHealth({ ...healthy, futureSessions: ['x'], scoresWithoutSession: 1 }).level).toBe('bad')
  })
})
