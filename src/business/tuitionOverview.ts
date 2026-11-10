/**
 * Màn HỌC PHÍ TOÀN TRUNG TÂM: mỗi học sinh-lớp ĐÚNG 1 dòng (trước đây bảng "Tổng quan"
 * 1 dòng/phiếu: lớp 11 em ra 22 dòng, cùng 1 em hiện nhiều lần). Mọi con số tính bằng
 * ĐÚNG các hàm của màn theo lớp (duePeriodsOf, unbilledSessionsOf, sessionsBilledOf,
 * periodDuplicateDates, effectiveRateOf…) để 2 màn không bao giờ lệch nhau. Thuần — có test.
 */
import type { Session } from '@/types'
import type { CenterOverview } from '@/services/overview'
import { emptyEntry } from './seed'
import { autoLevel } from '@/constants/rubrics'
import {
  duePeriodsOf, unbilledSessionsOf, unbilledOffsetOf, currentProgressOf, sessionsBilledOf,
  periodDuplicateDates, effectiveRateOf,
} from './tuition'

export type Att = 'present' | 'late' | 'excused' | 'absent'
export type TuitionKind = 'blocked' | 'due' | 'debt' | 'progress' | 'done'

export interface TuitionOverviewNotice {
  id: string; label: string; amount: number; sessionsBilled: number; status: 'paid' | 'unpaid'
  sentAt: string; paidAt: string | null; sessionIds: string[]
}
export interface TuitionOverviewRow {
  key: string
  classId: string; className: string; perMonth: number
  studentId: string; studentName: string
  /** Giá/buổi THỰC của em (đã áp học phí riêng nếu có). */
  rate: number
  kind: TuitionKind
  /** 0 = cần làm ngay, 1 = đang học dở kỳ, 2 = đã đóng đủ / chưa có gì để thu. */
  group: 0 | 1 | 2
  /** Kỳ đến hạn đầu tiên (nếu có). `blocked` khi kỳ có 2 buổi cùng ngày. */
  due: null | { label: string; count: number; chargeable: number; amount: number; from: string; to: string; duplicates: string[]; sessions: Array<{ id: string; date: string; att: Att; total: number | null }> }
  /** Số kỳ đến hạn (có thể > 1 khi để dồn). */
  dueCount: number
  /** Tổng tiền các phiếu đã gửi chưa đóng. */
  debt: number
  unpaid: TuitionOverviewNotice[]
  notices: TuitionOverviewNotice[]
  /** Tiến độ kỳ đang học dở (sau các kỳ đến hạn). */
  progress: { current: number; total: number } | null
  /** Các buổi của kỳ đang dở, đúng thứ tự — tô màu thanh tiến độ. */
  progressSessions: Array<{ date: string; att: Att }>
  /** Tạm tính kỳ đang dở = buổi tính tiền × giá thực. */
  estimate: number
  /** Buổi chưa thu nằm SAU kỳ đến hạn (kỳ sau đã bắt đầu). */
  afterDue: number
}

const perMonthOf = (c: CenterOverview['classes'][number]) => ((c.level ?? autoLevel(c.name)) === 'primary' ? 8 : 12)

export function tuitionOverviewRows(ov: CenterOverview): TuitionOverviewRow[] {
  const rows: TuitionOverviewRow[] = []
  const byPair = new Map<string, CenterOverview['sessions']>()
  for (const s of ov.sessions) {
    const k = `${s.classId}|${s.studentId}`
    const list = byPair.get(k)
    if (list) list.push(s)
    else byPair.set(k, [s])
  }
  for (const c of ov.classes) {
    const perMonth = perMonthOf(c)
    for (const st of c.students) {
      const raw = (byPair.get(`${c.id}|${st.id}`) ?? []).slice().sort((a, b) => a.no - b.no || a.date.localeCompare(b.date))
      const sessions: Session[] = raw.map((s) => ({ id: s.id, no: s.no, date: s.date, billed: s.billed, homework: '', entry: { ...emptyEntry(), attendance: s.attendance ?? 'present' } }))
      const totalOf = new Map(raw.map((s) => [s.id, s.total]))
      const student = { sessions, sessionOffset: st.sessionOffset }
      const myNotices = ov.notices.filter((n) => n.classId === c.id && n.studentId === st.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      const noticeLike = myNotices.map((n) => ({ periodFrom: n.periodFrom, periodTo: n.periodTo, sessionIds: n.sessionIds }))
      const rate = effectiveRateOf(c.tuitionPerSession ?? 0, c.studentTuition.find((t) => String(t.studentId) === st.id))
      const unbilled = unbilledSessionsOf(student)
      const dues = duePeriodsOf(student, perMonth, noticeLike)
      const d0 = dues[0]
      const dueSlice = d0 ? unbilled.slice(d0.from, d0.to) : []
      const due = d0 ? {
        label: d0.label, count: dueSlice.length,
        chargeable: sessionsBilledOf({ sessions: unbilled }, d0.from, d0.to),
        amount: sessionsBilledOf({ sessions: unbilled }, d0.from, d0.to) * rate,
        from: dueSlice[0]?.date ?? '', to: dueSlice.at(-1)?.date ?? '',
        duplicates: periodDuplicateDates(dueSlice, sessions),
        sessions: dueSlice.map((s) => ({ id: s.id, date: s.date, att: s.entry.attendance as Att, total: totalOf.get(s.id) ?? null })),
      } : null
      const inDue = dues.reduce((k, p) => k + (p.to - p.from), 0)
      const progress = currentProgressOf({ sessions: unbilled, sessionOffset: unbilledOffsetOf(student, perMonth, noticeLike) }, perMonth)
      const tail = progress ? unbilled.slice(unbilled.length - progress.current) : []
      const notices: TuitionOverviewNotice[] = myNotices.map((n) => ({ id: n.id, label: n.periodLabel, amount: n.finalAmount, sessionsBilled: n.sessionsBilled, status: n.paymentStatus, sentAt: n.sentAt, paidAt: n.paidAt, sessionIds: n.sessionIds }))
      const unpaid = notices.filter((n) => n.status === 'unpaid')
      const kind: TuitionKind = due?.duplicates.length ? 'blocked' : due ? 'due' : unpaid.length ? 'debt' : progress ? 'progress' : 'done'
      rows.push({
        key: `${c.id}|${st.id}`, classId: c.id, className: c.name, perMonth, studentId: st.id, studentName: st.name, rate, kind,
        group: kind === 'blocked' || kind === 'due' || kind === 'debt' ? 0 : kind === 'progress' ? 1 : 2,
        due, dueCount: dues.length, debt: unpaid.reduce((k, n) => k + n.amount, 0), unpaid, notices,
        progress, progressSessions: tail.map((s) => ({ date: s.date, att: s.entry.attendance as Att })),
        estimate: tail.filter((s) => s.entry.attendance !== 'absent').length * rate,
        afterDue: Math.max(0, unbilled.length - inDue),
      })
    }
  }
  const order: Record<TuitionKind, number> = { blocked: 0, due: 1, debt: 2, progress: 3, done: 4 }
  return rows.sort((a, b) => order[a.kind] - order[b.kind]
    || (a.kind === 'progress' ? (b.progress!.current / b.progress!.total) - (a.progress!.current / a.progress!.total) : 0)
    || (a.kind === 'debt' ? (a.unpaid[0]?.sentAt ?? '').localeCompare(b.unpaid[0]?.sentAt ?? '') : 0)
    || a.className.localeCompare(b.className, 'vi', { numeric: true }) || a.studentName.localeCompare(b.studentName, 'vi'))
}

export interface TuitionOverviewSummary {
  debt: { count: number; amount: number }
  due: { count: number; amount: number }
  blocked: number
  paidThisMonth: number
  inProgress: { count: number; estimate: number }
  done: number
}
/** `month` = 'YYYY-MM' theo giờ máy (todayISO().slice(0, 7)). */
export function tuitionOverviewSummary(rows: TuitionOverviewRow[], month: string): TuitionOverviewSummary {
  const debtRows = rows.filter((r) => r.debt > 0)
  const dueRows = rows.filter((r) => r.kind === 'due')
  const prog = rows.filter((r) => r.kind === 'progress')
  return {
    debt: { count: debtRows.length, amount: debtRows.reduce((k, r) => k + r.debt, 0) },
    due: { count: dueRows.length, amount: dueRows.reduce((k, r) => k + (r.due?.amount ?? 0), 0) },
    blocked: rows.filter((r) => r.kind === 'blocked').length,
    paidThisMonth: rows.flatMap((r) => r.notices).filter((n) => n.status === 'paid' && n.paidAt?.startsWith(month)).reduce((k, n) => k + n.amount, 0),
    inProgress: { count: prog.length, estimate: prog.reduce((k, r) => k + r.estimate, 0) },
    done: rows.filter((r) => r.kind === 'done').length,
  }
}

export type TuitionFilter = 'action' | 'debt' | 'due' | 'progress' | 'done' | 'all'
export function filterTuitionRows(rows: TuitionOverviewRow[], f: { status: TuitionFilter; classId?: string; query?: string }): TuitionOverviewRow[] {
  const q = (f.query ?? '').trim().toLocaleLowerCase('vi')
  return rows.filter((r) =>
    (!f.classId || r.classId === f.classId)
    && (!q || r.studentName.toLocaleLowerCase('vi').includes(q))
    && (f.status === 'all' || (f.status === 'action' && r.group === 0) || (f.status === 'debt' && r.debt > 0)
      || (f.status === 'due' && (r.kind === 'due' || r.kind === 'blocked')) || (f.status === 'progress' && r.kind === 'progress') || (f.status === 'done' && r.kind === 'done')))
}
