import { describe, expect, it } from 'vitest'
import type { CenterOverview } from '@/services/overview'
import { tuitionOverviewRows, tuitionOverviewSummary, filterTuitionRows } from './tuitionOverview'

const day = (start: string, i: number, step = 2) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i * step); return d.toISOString().slice(0, 10) }
type S = CenterOverview['sessions'][number]
const mk = (classId: string, studentId: string, n: number, opts: { start?: string; billed?: number; att?: (i: number) => S['attendance']; total?: number | null } = {}): S[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${studentId}-${i + 1}`, classId, studentId, no: i + 1, date: day(opts.start ?? '2026-09-01', i), billed: i < (opts.billed ?? 0), attendance: opts.att?.(i) ?? 'present', total: opts.total === undefined ? 70 : opts.total }))
const notice = (classId: string, studentId: string, from: number, to: number, o: Partial<CenterOverview['notices'][number]> = {}): CenterOverview['notices'][number] =>
  ({ id: `n-${studentId}-${from}`, classId, studentId, periodFrom: from, periodTo: to, periodLabel: `Buổi ${from + 1}–${to}`, sessionIds: [], sessionsBilled: to - from, ratePerSession: 60000, finalAmount: (to - from) * 60000, sentAt: '2026-10-20', paymentStatus: 'paid', paidAt: '2026-11-04', ...o })

function center(): CenterOverview {
  return {
    classes: [
      { id: 'L9', name: 'Lớp 9', level: null, teacherName: 'Kim oanh', tuitionPerSession: 60000, studentTuition: [], students: [{ id: 'linh', name: 'Gia Linh' }, { id: 'han', name: 'Mỹ Hân' }, { id: 'nga', name: 'Bích Nga' }] },
      { id: 'ST', name: 'Lớp Starters', level: 'primary', teacherName: 'Hương Trà', tuitionPerSession: 150000, studentTuition: [], students: [{ id: 'dan', name: 'Linh Đan' }] },
      { id: 'L7', name: 'Lớp 7', level: null, teacherName: 'Hoài Thương', tuitionPerSession: 60000, studentTuition: [{ studentId: 'vu', mode: 'percent', value: -50, reason: 'con GV' }], students: [{ id: 'vu', name: 'Vũ' }, { id: 'phong', name: 'Thanh Phong' }] },
      { id: 'L2', name: 'Lớp 2', level: null, teacherName: 'Hương Trà', tuitionPerSession: 75000, studentTuition: [], students: [{ id: 'an', name: 'Việt An' }, { id: 'moi', name: 'Học sinh mới' }] },
    ],
    sessions: [
      // Gia Linh: kỳ 1 đã đóng (12 buổi mang dấu), kỳ 2 đủ 12 + 1 buổi kỳ sau, có 1 buổi nghỉ có phép (vẫn tính tiền).
      ...mk('L9', 'linh', 25, { billed: 12, att: (i) => (i === 14 ? 'excused' : 'present') }),
      // Mỹ Hân: kỳ 1 gửi nhưng CHƯA đóng, kỳ 2 đủ 12 → vừa đến hạn vừa còn nợ.
      ...mk('L9', 'han', 24, { billed: 12 }),
      // Bích Nga: đang nợ, kỳ mới mới học 7 buổi.
      ...mk('L9', 'nga', 19, { billed: 12 }),
      // Linh Đan: chưa phiếu nào, 9 buổi, 2 buổi cùng ngày 30/09 trong kỳ đến hạn → bị chặn.
      ...mk('ST', 'dan', 9).map((s, i) => (i === 4 ? { ...s, date: day('2026-09-01', 3) } : s)),
      // Vũ: kỳ 1 có 1 buổi vắng không phép (phiếu 11 buổi), đang học dở 11/12 kỳ 2, học phí riêng -50%.
      ...mk('L7', 'vu', 23, { billed: 12, att: (i) => (i === 8 || i === 20 ? 'absent' : 'present') }),
      // Thanh Phong: đóng xong kỳ 1, đúng 12 buổi, chưa học buổi nào kỳ 2.
      ...mk('L7', 'phong', 12, { billed: 12 }),
      // Việt An: đóng 8, mới học 4 rồi chuyển lớp.
      ...mk('L2', 'an', 4, { billed: 4 }),
    ],
    notices: [
      notice('L9', 'linh', 0, 12),
      notice('L9', 'han', 0, 12, { paymentStatus: 'unpaid', paidAt: null, sentAt: '2026-10-30' }),
      notice('L9', 'nga', 0, 12, { paymentStatus: 'unpaid', paidAt: null, sentAt: '2026-11-04' }),
      notice('L7', 'vu', 0, 12, { sessionsBilled: 11, finalAmount: 660000 }),
      notice('L7', 'phong', 0, 12),
      notice('L2', 'an', 0, 8, { ratePerSession: 75000, finalAmount: 600000, paidAt: '2026-10-02' }),
    ],
  }
}
const rows = () => tuitionOverviewRows(center())
const row = (name: string) => rows().find((r) => r.studentName === name)!

describe('tuitionOverviewRows (học phí toàn trung tâm, mỗi em 1 dòng)', () => {
  it('mỗi học sinh-lớp đúng 1 dòng, kể cả em có nhiều phiếu', () => {
    const r = rows()
    expect(r).toHaveLength(8)
    expect(new Set(r.map((x) => x.key)).size).toBe(8)
  })
  it('Gia Linh: kỳ 2 đến hạn 12 buổi, nghỉ có phép VẪN tính tiền → 720.000đ; buổi thứ 25 thuộc kỳ sau', () => {
    expect(row('Gia Linh')).toMatchObject({ kind: 'due', group: 0, debt: 0, afterDue: 1, due: { count: 12, chargeable: 12, amount: 720000, duplicates: [] } })
  })
  it('Mỹ Hân: vừa đến hạn kỳ 2 vừa còn nợ kỳ 1 — hiện cả 2', () => {
    expect(row('Mỹ Hân')).toMatchObject({ kind: 'due', debt: 720000, due: { amount: 720000 } })
    expect(row('Mỹ Hân').unpaid).toHaveLength(1)
  })
  it('Bích Nga: đang nợ, kỳ mới mới học 7/12', () => {
    expect(row('Bích Nga')).toMatchObject({ kind: 'debt', group: 0, debt: 720000, progress: { current: 7, total: 12 } })
  })
  it('Linh Đan: kỳ đến hạn có 2 buổi cùng ngày → bị chặn, không gửi được', () => {
    const r = row('Linh Đan')
    expect(r.kind).toBe('blocked')
    expect(r.due!.duplicates).toEqual([day('2026-09-01', 3)])
    expect(r.rate).toBe(150000)
  })
  it('Vũ: học phí riêng -50% → tạm tính theo giá THỰC, buổi vắng không phép không tính', () => {
    const r = row('Vũ')
    expect(r).toMatchObject({ kind: 'progress', group: 1, rate: 30000, progress: { current: 11, total: 12 } })
    expect(r.estimate).toBe(10 * 30000)
    expect(r.progressSessions.filter((s) => s.att === 'absent')).toHaveLength(1)
  })
  it('Thanh Phong đóng đủ, chưa học kỳ mới; Việt An đóng dư do chuyển lớp; em chưa có buổi → "done", không báo gì', () => {
    expect(row('Thanh Phong')).toMatchObject({ kind: 'done', group: 2, progress: null, debt: 0 })
    expect(row('Việt An')).toMatchObject({ kind: 'done', debt: 0, due: null })
    expect(row('Học sinh mới')).toMatchObject({ kind: 'done', due: null })
  })
  it('thứ tự: bị chặn → đến hạn → đang nợ (nợ lâu trước) → đang học (gần đủ kỳ trước) → xong', () => {
    expect(rows().map((r) => r.kind)).toEqual(['blocked', 'due', 'due', 'debt', 'progress', 'done', 'done', 'done'])
  })
})

describe('tuitionOverviewSummary + filterTuitionRows', () => {
  it('tổng: nợ, đến hạn, bị chặn, đã thu trong tháng, đang học dở', () => {
    expect(tuitionOverviewSummary(rows(), '2026-11')).toEqual({
      debt: { count: 2, amount: 1440000 }, due: { count: 2, amount: 1440000 }, blocked: 1,
      paidThisMonth: 720000 + 660000 + 720000, inProgress: { count: 1, estimate: 300000 }, done: 3,
    })
  })
  it('lọc theo trạng thái, lớp, tên (không phân biệt hoa thường, có dấu)', () => {
    expect(filterTuitionRows(rows(), { status: 'action' }).map((r) => r.studentName)).toEqual(['Linh Đan', 'Gia Linh', 'Mỹ Hân', 'Bích Nga'])
    expect(filterTuitionRows(rows(), { status: 'debt' }).map((r) => r.studentName)).toEqual(['Mỹ Hân', 'Bích Nga'])
    expect(filterTuitionRows(rows(), { status: 'due' })).toHaveLength(3)
    expect(filterTuitionRows(rows(), { status: 'all', classId: 'L7' }).map((r) => r.studentName)).toEqual(['Vũ', 'Thanh Phong'])
    expect(filterTuitionRows(rows(), { status: 'all', query: 'linh' }).map((r) => r.studentName)).toEqual(['Linh Đan', 'Gia Linh'])
  })
})
