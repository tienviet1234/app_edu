import { describe, it, expect } from 'vitest'
import { buildCenterOverview, type OverviewRaw } from './centerOverview.js'

const raw = (): OverviewRaw => ({
  classes: [
    { _id: 'c7', name: 'Lớp 7', teacherId: 't1', studentIds: ['a', 'b'], tuitionPerSession: 60000, studentTuition: [{ studentId: 'a', mode: 'percent', value: -10 }] },
    { _id: 'c9', name: 'Lớp 9', teacherId: 't2', assistantTeacherIds: ['t1'], studentIds: ['c'], tuitionPerSession: 60000 },
    { _id: 'c2', name: 'Lớp 2', teacherId: 't2', studentIds: ['d'] },
    { _id: 'done', name: 'Lớp đã kết thúc', teacherId: 't2', studentIds: [] },
  ],
  users: [{ _id: 't1', name: 'Cô Thương' }, { _id: 't2', name: 'Cô Trà' }, { _id: 'a', name: 'An' }, { _id: 'b', name: 'Bình', sessionOffset: 5 }, { _id: 'c', name: 'Chi' }, { _id: 'd', name: 'Dung' }],
  sessions: [
    { _id: 's1', classId: 'c7', studentId: 'a', lessonNo: 1, scheduledAt: new Date('2026-11-03T00:00:00Z'), billed: true },
    { _id: 's2', classId: 'c7', studentId: 'a', lessonNo: 2, scheduledAt: '2026-11-05T00:00:00.000Z' },
    { _id: 's3', classId: 'c7', studentId: 'b', lessonNo: 1, scheduledAt: '2026-11-05T00:00:00.000Z', deletedAt: new Date() },
    { _id: 's4', classId: 'c9', studentId: 'c', lessonNo: 1, scheduledAt: '2026-11-05T00:00:00.000Z' },
    { _id: 's5', classId: 'c2', studentId: 'd', lessonNo: 1, scheduledAt: '2026-11-05T00:00:00.000Z' },
  ],
  scores: [
    { sessionId: 's1', attendance: 'present', total: 82, scores: { mini: 30 } },
    { sessionId: 's2', attendance: 'late', total: 0 },
  ],
  notices: [
    { _id: 'n1', classId: 'c7', studentId: 'a', periodFrom: 0, periodTo: 12, periodLabel: 'Buổi 1–12', sessionIds: ['s1'], sessionsBilled: 12, ratePerSession: 60000, finalAmount: 720000, sentAt: new Date('2026-11-08T03:00:00Z'), paymentStatus: 'unpaid' },
    { _id: 'n2', classId: 'c2', studentId: 'd', periodFrom: 0, periodTo: 8, periodLabel: 'Buổi 1–8', sessionsBilled: 8, ratePerSession: 75000, finalAmount: 600000, sentAt: new Date('2026-10-01T00:00:00Z'), paymentStatus: 'paid', paidAt: new Date('2026-10-05T00:00:00Z') },
  ],
})

describe('buildCenterOverview (dữ liệu màn tổng quan toàn trung tâm)', () => {
  it('admin thấy mọi lớp, kể cả lớp đã kết thúc (có thể còn nợ học phí)', () => {
    const r = buildCenterOverview(raw(), { id: 'x', role: 'admin' })
    expect(r.classes.map((c) => c.name)).toEqual(['Lớp 7', 'Lớp 9', 'Lớp 2', 'Lớp đã kết thúc'])
    expect(r.notices.map((n) => n.id)).toEqual(['n1', 'n2'])
  })
  it('giáo viên chỉ thấy lớp mình dạy, kể cả lớp làm giáo viên PHỤ; không thấy buổi/phiếu lớp khác', () => {
    const r = buildCenterOverview(raw(), { id: 't1', role: 'teacher' })
    expect(r.classes.map((c) => c.name)).toEqual(['Lớp 7', 'Lớp 9'])
    expect(r.sessions.every((x) => x.classId !== 'c2')).toBe(true)
    expect(r.notices.map((n) => n.id)).toEqual(['n1'])
  })
  it('bỏ buổi đã xóa; buổi chỉ có điểm danh (total 0, chưa chấm) có điểm = null, không phải 0', () => {
    const r = buildCenterOverview(raw(), { id: 'x', role: 'admin' })
    expect(r.sessions.find((x) => x.id === 's3')).toBeUndefined()
    expect(r.sessions.find((x) => x.id === 's1')).toMatchObject({ date: '2026-11-03', billed: true, attendance: 'present', total: 82 })
    expect(r.sessions.find((x) => x.id === 's2')).toMatchObject({ attendance: 'late', total: null, billed: false })
    expect(r.sessions.find((x) => x.id === 's4')).toMatchObject({ attendance: null, total: null })
  })
  it('tên giáo viên, học phí riêng, số buổi đã học trước khi vào app đi kèm lớp', () => {
    const r = buildCenterOverview(raw(), { id: 'x', role: 'admin' })
    const c7 = r.classes[0]
    expect(c7).toMatchObject({ teacherName: 'Cô Thương', tuitionPerSession: 60000 })
    expect(c7.studentTuition).toHaveLength(1)
    expect(c7.students).toEqual([{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình', sessionOffset: 5 }])
  })
  it('phiếu: ngày gửi/đóng dạng ngày, danh sách buổi dạng chuỗi', () => {
    const r = buildCenterOverview(raw(), { id: 'x', role: 'admin' })
    expect(r.notices[0]).toMatchObject({ sentAt: '2026-11-08', paidAt: null, sessionIds: ['s1'] })
    expect(r.notices[1]).toMatchObject({ paidAt: '2026-10-05', sessionIds: [] })
  })
})
