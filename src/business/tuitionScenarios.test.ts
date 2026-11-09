/**
 * KỊCH BẢN HỌC PHÍ + ĐIỂM DANH trọn vòng đời 1 học sinh, chạy bằng HÀM THẬT của app
 * (tuition.ts) và của server (dataRules.ts: checkNoticeSessions, billedDeleteBlockReason,
 * noticeCoverage). Mỗi bước đều kiểm các điều BẤT BIẾN về tiền:
 *   (1) không buổi nào nằm trong 2 phiếu (thu 2 lần);
 *   (2) buổi mang dấu "đã thu" = đúng hợp các buổi trong phiếu;
 *   (3) kỳ đến hạn không chứa buổi đã thu / đã nằm trong phiếu;
 *   (4) không buổi nào bị bỏ sót vĩnh viễn: đã thu + chưa thu = toàn bộ buổi;
 *   (5) tiền trên phiếu = số buổi tính tiền (có mặt/muộn/nghỉ có phép) × giá — trừ khi
 *       điểm danh bị sửa SAU khi gửi phiếu (khi đó `noticeAttendanceDrift` phải phát hiện).
 */
import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { emptyEntry } from './seed'
import {
  duePeriodsOf, unbilledSessionsOf, sessionsBilledOf, periodDuplicateDates, sessionLabelOf,
  unbilledOffsetOf, currentProgressOf, type NoticeLike,
} from './tuition'
import { checkNoticeSessions, billedDeleteBlockReason, noticeCoverage, noticeAttendanceDrift } from '../../server/src/utils/dataRules'

type Att = 'present' | 'late' | 'excused' | 'absent'
interface Notice extends NoticeLike { id: string; sessionsBilled: number; amount: number; paid: boolean }

let seq = 0
const oid = () => (++seq).toString(16).padStart(24, '0')

/** Server thu nhỏ cho 1 học sinh trong 1 lớp — mô phỏng đúng các đường ghi thật. */
class Center {
  sessions: Session[] = []
  notices: Notice[] = []
  perMonth: 8 | 12
  rate: number
  sessionOffset?: number
  constructor(perMonth: 8 | 12, rate: number, sessionOffset?: number) { this.perMonth = perMonth; this.rate = rate; this.sessionOffset = sessionOffset }

  student() { return { sessions: this.sessions, sessionOffset: this.sessionOffset } }

  /** POST /sessions { placeByDate: true }: xếp theo NGÀY, đánh lại số 1..n. */
  add(date: string, att: Att = 'present', opts: { temp?: boolean } = {}): Session {
    const s: Session = { id: opts.temp ? `tmp-${++seq}` : oid(), no: 0, date, entry: { ...emptyEntry(), attendance: att } }
    this.sessions.push(s)
    this.renumber()
    return s
  }
  renumber() {
    this.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
    this.sessions.forEach((s, i) => { s.no = i + 1 })
  }
  setAttendance(date: string, att: Att) { this.sessions.find((s) => s.date === date)!.entry.attendance = att }
  due() { return duePeriodsOf(this.student(), this.perMonth, this.notices) }

  /** Màn Học phí bấm "Gửi" kỳ đến hạn đầu tiên → server tạo phiếu + đánh dấu trong 1 giao dịch. */
  sendFirstDue(): { ok: true; notice: Notice } | { ok: false; why: string } {
    const p = this.due()[0]
    if (!p) return { ok: false, why: 'không có kỳ đến hạn' }
    const unbilled = { sessions: unbilledSessionsOf(this.student()) }
    if (p.unsynced) return { ok: false, why: 'UNSYNCED' }
    const dups = periodDuplicateDates(unbilled.sessions.slice(p.from, p.to), this.sessions)
    if (dups.length) return { ok: false, why: `DUPLICATE ${dups.join(',')}` }
    const check = checkNoticeSessions({
      studentId: 'st', classId: 'c', requested: p.sessionIds,
      sessions: this.sessions.map((s) => ({ _id: s.id, studentId: 'st', classId: 'c' })),
      alreadyNoticed: this.notices.flatMap((n) => n.sessionIds ?? []),
    })
    if (!check.ok) return { ok: false, why: check.code }
    const sessionsBilled = sessionsBilledOf(unbilled, p.from, p.to)
    const notice: Notice = { id: oid(), periodFrom: p.storeFrom, periodTo: p.storeTo, sessionIds: p.sessionIds, sessionsBilled, amount: sessionsBilled * this.rate, paid: false }
    this.notices.push(notice)
    for (const id of p.sessionIds) this.sessions.find((s) => s.id === id)!.billed = true
    return { ok: true, notice }
  }
  /** DELETE /tuition-notices/:id — gỡ dấu đúng các buổi của phiếu. */
  deleteNotice(id: string) {
    const n = this.notices.find((x) => x.id === id)!
    this.notices = this.notices.filter((x) => x.id !== id)
    for (const sid of n.sessionIds ?? []) { const s = this.sessions.find((x) => x.id === sid); if (s) s.billed = false }
  }
  /** DELETE /sessions/:id — server chặn buổi đã thu. */
  deleteSession(date: string): string | null {
    const s = this.sessions.find((x) => x.date === date)!
    const blocked = billedDeleteBlockReason(s)
    if (blocked) return blocked
    this.sessions = this.sessions.filter((x) => x !== s)
    this.renumber()
    return null
  }

  /** Các điều bất biến — trả về danh sách vi phạm (rỗng = đúng). */
  violations(): string[] {
    const out: string[] = []
    const inNotice = this.notices.flatMap((n) => n.sessionIds ?? [])
    if (new Set(inNotice).size !== inNotice.length) out.push('(1) 1 buổi nằm trong 2 phiếu')
    const billedIds = this.sessions.filter((s) => s.billed).map((s) => s.id).sort()
    const live = new Set(this.sessions.map((s) => s.id))
    // Phiếu kiểu mới: mọi buổi có tên trong phiếu phải mang dấu. Phiếu kiểu cũ không ghi
    // buổi → chỉ so được TỔNG số (2b).
    const unflagged = inNotice.filter((id) => live.has(id) && !this.sessions.find((s) => s.id === id)!.billed)
    if (unflagged.length) out.push(`(2) ${unflagged.length} buổi có tên trong phiếu mà không mang dấu "đã thu"`)
    const covered = this.notices.reduce((k, n) => k + noticeCoverage(n), 0)
    if (covered !== billedIds.length) out.push(`(2b) phiếu phủ ${covered} ≠ ${billedIds.length} buổi mang dấu`)
    for (const p of this.due()) {
      if (p.sessionIds.some((id) => this.sessions.find((s) => s.id === id)?.billed || inNotice.includes(id))) out.push('(3) kỳ đến hạn chứa buổi đã thu')
    }
    if (billedIds.length + unbilledSessionsOf(this.student()).length !== this.sessions.length) out.push('(4) buổi bị bỏ sót')
    return out
  }
  /** (5) phiếu nào tiền lệch điểm danh hiện tại — so bằng hàm thật noticeAttendanceDrift. */
  drift() { return this.notices.map((n) => noticeAttendanceDrift(n, this.sessions.map((s) => ({ id: s.id, attendance: s.entry.attendance })))).filter((d) => d != null) }
}

const days = (from: string, count: number, stepDays = 2) => Array.from({ length: count }, (_, i) => {
  const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i * stepDays); return d.toISOString().slice(0, 10)
})
const fill = (c: Center, from: string, count: number, att: (i: number) => Att = () => 'present') => days(from, count).forEach((d, i) => c.add(d, att(i)))

describe('Kịch bản học phí trọn vòng đời (hàm thật app + server)', () => {
  it('S1 Cấp 1 (8 buổi/kỳ) học 3 kỳ liền, gửi phiếu đúng lúc: 3 phiếu × 8 buổi, không buổi nào thu 2 lần', () => {
    const c = new Center(8, 75000)
    for (let k = 0; k < 3; k++) {
      fill(c, days('2026-09-01', 3, 16)[k], 8)
      expect(c.due()).toHaveLength(1)
      expect(c.sendFirstDue()).toMatchObject({ ok: true, notice: { sessionsBilled: 8, amount: 600000 } })
      expect(c.violations()).toEqual([])
    }
    expect(c.notices.map((n) => [n.periodFrom, n.periodTo])).toEqual([[0, 8], [8, 16], [16, 24]])
    expect(c.due()).toEqual([])
  })

  it('S2 Vắng không phép trong kỳ: kỳ vẫn 12 buổi, chỉ thu 11 (ca Vũ Lớp 7) — không báo lệch', () => {
    const c = new Center(12, 60000)
    fill(c, '2026-09-08', 12, (i) => (i === 8 ? 'absent' : 'present'))
    expect(c.sendFirstDue()).toMatchObject({ ok: true, notice: { sessionsBilled: 11, amount: 660000 } })
    expect(c.violations()).toEqual([])
    expect(c.drift()).toEqual([])
  })

  it('S3 Nghỉ có phép + đi muộn vẫn tính tiền; chỉ nghỉ không phép là không', () => {
    const c = new Center(8, 75000)
    const att: Att[] = ['present', 'late', 'excused', 'absent', 'present', 'absent', 'excused', 'late']
    fill(c, '2026-09-01', 8, (i) => att[i])
    expect(c.sendFirstDue()).toMatchObject({ ok: true, notice: { sessionsBilled: 6, amount: 450000 } })
  })

  it('S4 Chưa đủ kỳ → không đến hạn, hiện tiến độ đúng; đủ buổi thứ 8 mới đến hạn', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 7)
    expect(c.due()).toEqual([])
    expect(currentProgressOf(c.student(), 8)).toEqual({ current: 7, total: 8 })
    c.add('2026-09-30')
    expect(c.due()).toHaveLength(1)
  })

  it('S5 Để dồn 2 kỳ mới gửi: gửi lần lượt được cả 2, không chồng buổi', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 16)
    expect(c.due()).toHaveLength(2)
    expect(c.sendFirstDue().ok).toBe(true)
    expect(c.violations()).toEqual([])
    expect(c.due()).toHaveLength(1)
    expect(c.sendFirstDue().ok).toBe(true)
    expect(c.violations()).toEqual([])
    expect(c.due()).toEqual([])
  })

  it('S6 Gửi nhầm rồi xóa phiếu: đúng các buổi đó đến hạn lại, gửi lại được, không mất buổi', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 8)
    const first = c.sendFirstDue()
    if (!first.ok) throw new Error(first.why)
    c.deleteNotice(first.notice.id)
    expect(c.violations()).toEqual([])
    expect(c.due()[0].sessionIds).toEqual(first.notice.sessionIds)
    expect(c.sendFirstDue().ok).toBe(true)
    expect(c.violations()).toEqual([])
  })

  it('S7 Xóa buổi ĐÃ THU bị chặn (sự cố 08/11); xóa buổi chưa thu thì kỳ đang dở ngắn lại, không đến hạn sớm', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 8)
    c.sendFirstDue()
    expect(c.deleteSession('2026-09-01')).not.toBeNull()
    fill(c, '2026-10-01', 8)
    expect(c.due()).toHaveLength(1)
    expect(c.deleteSession('2026-10-15')).toBeNull()
    expect(c.due()).toEqual([])
    expect(c.violations()).toEqual([])
  })

  it('S8 Hai buổi CÙNG NGÀY trong kỳ (1 bản đã thu + 1 bản chưa thu) → chặn gửi, không thu 2 lần', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 8)
    c.sendFirstDue()
    c.add('2026-09-01') // bản trùng ngày tạo sau, chưa thu
    fill(c, '2026-10-01', 7)
    expect(c.due()).toHaveLength(1)
    expect(c.sendFirstDue()).toMatchObject({ ok: false, why: expect.stringContaining('DUPLICATE') })
    expect(c.violations()).toEqual([])
  })

  it('S9 Kỳ có buổi CHƯA lên server (id tạm) → chặn gửi, không đánh dấu nửa vời', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 7)
    c.add('2026-09-30', 'present', { temp: true })
    expect(c.sendFirstDue()).toEqual({ ok: false, why: 'UNSYNCED' })
    expect(c.sessions.some((s) => s.billed)).toBe(false)
  })

  it('S10 Thêm BÙ 1 buổi có ngày nằm trong kỳ đã thu (placeByDate): buổi bù đi vào kỳ sau, không ai bị thu 2 lần', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 8)
    c.sendFirstDue()
    c.add('2026-09-04') // học bù, ngày cũ
    fill(c, '2026-10-01', 7)
    const p = c.due()
    expect(p).toHaveLength(1)
    expect(p[0].sessionIds).toContain(c.sessions.find((s) => s.date === '2026-09-04')!.id)
    expect(c.sendFirstDue().ok).toBe(true)
    expect(c.violations()).toEqual([])
  })

  it('S11 Học sinh vào GIỮA kỳ (đã học 5 buổi ở ngoài): kỳ đầu chỉ 3 buổi, các kỳ sau đủ 8', () => {
    const c = new Center(8, 75000, 5)
    fill(c, '2026-09-01', 3)
    expect(c.due()).toHaveLength(1)
    expect(c.due()[0].sessionIds).toHaveLength(3)
    expect(c.sendFirstDue()).toMatchObject({ ok: true, notice: { sessionsBilled: 3 } })
    fill(c, '2026-09-10', 7)
    expect(c.due()).toEqual([])
    c.add('2026-10-30')
    expect(c.due()[0].sessionIds).toHaveLength(8)
    expect(unbilledOffsetOf(c.student(), 8, c.notices)).toBe(0)
    expect(c.violations()).toEqual([])
  })

  it('S12 Phiếu kiểu cũ (theo vị trí, chưa ghi buổi) rồi tới phiếu kiểu mới: không đếm lại kỳ cũ', () => {
    const c = new Center(12, 60000)
    fill(c, '2026-09-01', 24)
    // Phiếu cũ: chỉ lưu vị trí [0–12]; app đã đánh dấu 12 buổi đầu (sau đợt sửa 08/11).
    c.notices.push({ id: oid(), periodFrom: 0, periodTo: 12, sessionsBilled: 12, amount: 720000, paid: true })
    c.sessions.slice(0, 12).forEach((s) => { s.billed = true })
    expect(c.violations()).toEqual([])
    expect(c.due()).toHaveLength(1)
    expect(c.due()[0].sessionIds).toEqual(c.sessions.slice(12).map((s) => s.id))
    expect(c.sendFirstDue()).toMatchObject({ ok: true, notice: { periodFrom: 12, periodTo: 24 } })
    expect(c.violations()).toEqual([])
  })

  it('S13 Phiếu kiểu cũ mà THIẾU dấu 1 buổi (sự cố 08/11): kỳ sau lẫn buổi đã thu — bất biến phát hiện', () => {
    const c = new Center(12, 60000)
    fill(c, '2026-09-12', 24)
    c.notices.push({ id: oid(), periodFrom: 0, periodTo: 12, sessionsBilled: 12, amount: 720000, paid: true })
    c.sessions.slice(1, 12).forEach((s) => { s.billed = true }) // buổi 1 mất dấu
    expect(c.violations().join()).toContain('(2b)')
  })

  it('S14 Sửa điểm danh SAU khi gửi phiếu → tiền trên phiếu lệch, noticeAttendanceDrift phát hiện đúng số buổi + số tiền', () => {
    const c = new Center(8, 75000)
    fill(c, '2026-09-01', 8, (i) => (i === 2 ? 'absent' : 'present'))
    c.sendFirstDue() // thu 7 buổi
    c.setAttendance('2026-09-05', 'present') // giáo viên sửa lại: hôm đó có đi học
    expect(c.drift()).toEqual([{ billed: 7, chargeableNow: 8, diffAmount: 75000 }])
    c.setAttendance('2026-09-05', 'absent')
    c.setAttendance('2026-09-01', 'absent') // ngược lại: phiếu thu thừa
    expect(c.drift()).toEqual([{ billed: 7, chargeableNow: 6, diffAmount: -75000 }])
  })

  it('S15 Nhãn buổi không lệch giữa các kỳ: Buổi 13 của lớp 12 buổi/kỳ là "Buổi 1 · T.2"', () => {
    expect(sessionLabelOf(12, 12)).toBe('Buổi 12')
    expect(sessionLabelOf(13, 12)).toBe('Buổi 1 · T.2')
    expect(sessionLabelOf(9, 8)).toBe('Buổi 1 · T.2')
  })

  it('S16 Ngẫu nhiên 300 lượt thao tác (thêm/vắng/gửi/xóa phiếu/xóa buổi/học bù): bất biến (1)–(4) luôn đúng', () => {
    let r = 42
    const rnd = (n: number) => { r = (r * 1103515245 + 12345) % 2147483648; return r % n }
    for (let run = 0; run < 30; run++) {
      const c = new Center(rnd(2) ? 8 : 12, 60000, rnd(3) ? undefined : rnd(7))
      let day = 0
      const nextDay = () => { day += 1 + rnd(3); const d = new Date(Date.UTC(2026, 8, 1 + day)); return d.toISOString().slice(0, 10) }
      for (let step = 0; step < 10; step++) {
        const op = rnd(10)
        if (op < 5) c.add(nextDay(), (['present', 'late', 'excused', 'absent'] as Att[])[rnd(4)])
        else if (op < 7) c.sendFirstDue()
        else if (op === 7 && c.notices.length) c.deleteNotice(c.notices[rnd(c.notices.length)].id)
        else if (op === 8 && c.sessions.length) c.deleteSession(c.sessions[rnd(c.sessions.length)].date)
        else if (c.sessions.length) { const d = new Date(Date.UTC(2026, 8, 1 + rnd(day + 1))).toISOString().slice(0, 10); if (!c.sessions.some((s) => s.date === d)) c.add(d) }
        expect(c.violations(), `lượt ${run} bước ${step}`).toEqual([])
      }
    }
  })
})
