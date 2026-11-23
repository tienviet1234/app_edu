import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ClassData, Session } from '@/types'
import { C, SHEET_PAINT } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { getClassRubric, rubricOn } from '@/constants/rubrics'
import { sessionScore, sessionComps } from '@/business/scoring'
import { attendanceDayOptions, dayAttendanceStats } from '@/business/quickAttendance'
import { weekdayLabel, dm } from '@/business/attendanceOverview'
import { sessionLabelOf } from '@/business/tuition'
import {
  sheetGroups, arrangeGroups, cellView, applySheetEdit, applyEvidenceText, toggleTag, rowProgress, parsePaste, pasteTargets,
  attFromKey, sessionOnDate, dayMaxOf, hiddenWithData, readPrefs, DEFAULT_PREFS, isLocked,
  type SheetColumn, type SheetGroup, type SheetPrefs, type Paint,
} from '@/business/gradeSheet'
import { isMongoid } from '@/utils/mongoid'
import { todayISO } from '@/utils/format'
import { toast } from '@/store/toastStore'
import { useSheetWriter, type SheetRowStatus } from './useSheetWriter'

const ATT_LABEL = { present: 'Đúng giờ', late: 'Muộn', excused: 'Nghỉ có phép', absent: 'Nghỉ không phép' } as const
const prefsKey = (classId: string) => `lms:gradeSheetPrefs:${classId}`
const loadPrefs = (classId: string): SheetPrefs => { try { return readPrefs(localStorage.getItem(prefsKey(classId))) } catch { return { ...DEFAULT_PREFS } } }

function usePhone() {
  const q = '(max-width: 767px)'
  const [phone, setPhone] = useState(() => { try { return window.matchMedia(q).matches } catch { return false } })
  useEffect(() => {
    let m: MediaQueryList
    try { m = window.matchMedia(q) } catch { return }
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}

const paintStyle = (p: Paint, oneColor: boolean, disabled: boolean): CSSProperties => {
  if (disabled) return { background: SHEET_PAINT.locked.bg, color: SHEET_PAINT.locked.fg, border: SHEET_PAINT.locked.bd }
  const attPaint = p === 'present' || p === 'late' || p === 'excused' || p === 'absent'
  const s = oneColor && p !== 'empty' && !attPaint ? SHEET_PAINT.one : SHEET_PAINT[p]
  return { background: s.bg, color: s.fg, border: s.bd }
}
const totalStyle = (t: number | null): CSSProperties =>
  t == null ? { background: C.paper, color: C.muted } : t >= 80 ? { background: SHEET_PAINT.full.bg, color: SHEET_PAINT.full.fg } : t >= 65 ? { background: SHEET_PAINT.mid.bg, color: SHEET_PAINT.mid.fg } : { background: SHEET_PAINT.zero.bg, color: SHEET_PAINT.zero.fg }

type Row = { studentId: string; name: string; on: ReturnType<typeof sessionOnDate<Session>> }

/** Ô số: gõ xong (rời ô / Enter) mới ghi; Esc = hủy; quá thang → viền đỏ, giữ chữ đang gõ, KHÔNG ghi. */
function NumCell({ value, max, style, disabled, label, r, c, big, colId, onCommit, onPaste, onNav }: {
  value: string; max?: number; style: CSSProperties; disabled: boolean; label: string; r: number; c: number; big?: boolean; colId: string
  onCommit: (raw: string) => { ok: boolean; reason?: string }
  onPaste: (text: string) => void
  onNav: (e: ReactKeyboardEvent<HTMLElement>, atStart: boolean, atEnd: boolean) => void
}) {
  const [draft, setDraftState] = useState(value)
  const draftRef = useRef(value)
  const skipBlur = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!err) setDraft(value) }, [value])
  function commit() {
    if (skipBlur.current) { skipBlur.current = false; return }
    if (draftRef.current.trim() === value) { setErr(null); return }
    const res = onCommit(draftRef.current)
    if (res.ok) setErr(null)
    else setErr(res.reason ?? 'Không ghi được')
  }
  const errStyle: CSSProperties = err ? { background: SHEET_PAINT.error.bg, color: SHEET_PAINT.error.fg, border: SHEET_PAINT.error.bd } : {}
  return (
    <input
      type="text" inputMode="decimal" value={draft} disabled={disabled}
      data-r={r} data-c={c} data-col={colId} aria-label={label} aria-invalid={err ? true : undefined}
      title={err ?? (max != null ? `${label} — tối đa ${max}` : label)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={commit}
      onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[\t\n]/.test(t.trim()) || t.includes('\t')) { e.preventDefault(); onPaste(t) } }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { skipBlur.current = true; setErr(null); setDraft(value); e.currentTarget.blur(); return }
        const el = e.currentTarget
        onNav(e, el.selectionStart === 0 && el.selectionEnd === 0, el.selectionStart === el.value.length)
      }}
      className={`${big ? 'h-12 w-16 text-lg' : 'h-9 w-12 text-[15px]'} rounded-lg text-center font-bold outline-none focus:ring-[3px] focus:ring-blue-700 disabled:cursor-not-allowed`}
      style={{ ...style, ...errStyle }}
    />
  )
}

function TextCell({ value, label, r, c, onCommit, onNav, wide, colId }: { value: string; label: string; r: number; c: number; wide?: boolean; colId: string; onCommit: (v: string) => void; onNav: (e: ReactKeyboardEvent<HTMLElement>, s: boolean, e2: boolean) => void }) {
  const [draft, setDraftState] = useState(value)
  const draftRef = useRef(value)
  const skipBlur = useRef(false)
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(value) }, [value])
  const p = (draft.trim() ? SHEET_PAINT.text : SHEET_PAINT.empty)
  return (
    <input
      type="text" value={draft} data-r={r} data-c={c} data-col={colId} aria-label={label} placeholder="Ghi nhận xét…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return } if (draftRef.current !== value) onCommit(draftRef.current) }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { skipBlur.current = true; setDraft(value); e.currentTarget.blur(); return }
        const el = e.currentTarget
        onNav(e, el.selectionStart === 0 && el.selectionEnd === 0, el.selectionStart === el.value.length)
      }}
      className={`${wide ? 'h-12 w-full' : 'h-9 w-56'} rounded-lg px-2 text-[13px] outline-none focus:ring-[3px] focus:ring-blue-700`}
      style={{ background: p.bg, color: p.fg, border: p.bd }}
    />
  )
}

function statusText(st: SheetRowStatus | undefined, session: Session | null): { text: string; color: string } {
  if (st?.kind === 'saving') return { text: '● Đang lưu…', color: C.amber }
  if (st?.kind === 'offline') return { text: '● Chờ mạng để gửi', color: C.amber }
  if (st?.kind === 'error') return { text: `! Chưa lưu — ${st.msg}`, color: C.rose }
  if (session && (session.dirty || !isMongoid(session.id))) return { text: '● Chưa lên server', color: C.amber }
  if (session) return { text: '✓ Đã lưu', color: C.emerald }
  return { text: '', color: C.muted }
}

/** Bảng chấm điểm (21/11, đợt 1): cả lớp × đúng các tiêu chí phiếu chấm của lớp, 1 NGÀY. Ô đã nhập tô
 *  màu theo mức. Ghi qua `useSheetWriter` → `pushSession`. Lõi: `business/gradeSheet.ts` (có test). */
export function GradeSheetView({ cls, update, teacherName, onOpenEntry }: {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
  teacherName?: string
  onOpenEntry: (studentId: string, no: number) => void
}) {
  const today = todayISO()
  const phone = usePhone()
  const days = useMemo(() => attendanceDayOptions(cls.students, today, 120), [cls.students, today])
  const [date, setDate] = useState(() => { const t = days.find((d) => d.date === today && d.scheduled); return t ? t.date : (days.filter((d) => d.scheduled).at(-1)?.date ?? days.at(-1)?.date ?? today) })
  // Cột = tiêu chí đúng PHIÊN BẢN phiếu của ngày đang xem (đợt 2 — buổi cũ giữ phiếu cũ).
  const r = useMemo(() => rubricOn(getClassRubric(cls), date), [cls, date])
  const [prefs, setPrefsState] = useState<SheetPrefs>(() => loadPrefs(cls.id))
  const setPrefs = (p: SheetPrefs) => { setPrefsState(p); try { localStorage.setItem(prefsKey(cls.id), JSON.stringify(p)) } catch { /* tiện ích nhớ cách xem */ } }
  const [showPrefs, setShowPrefs] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [phoneTable, setPhoneTable] = useState(false)
  const allGroups = useMemo(() => sheetGroups(r), [r])
  const groups = useMemo(() => arrangeGroups(allGroups, prefs), [allGroups, prefs])
  const [crit, setCrit] = useState<string>('att')
  const cols = groups.flatMap((g) => g.cols)
  const w = useSheetWriter(cls, update, teacherName)
  const oneColor = prefs.color === 'one'
  const askedOffDay = useRef(new Set<string>())
  const bulkRef = useRef(false)
  const [bulk, setBulk] = useState(false)
  const tableRef = useRef<HTMLDivElement>(null)

  const rows: Row[] = cls.students.map((st) => ({ studentId: st.id, name: st.name, on: sessionOnDate(st.sessions, date) }))
  const sessionsToday = rows.flatMap((x) => (x.on.kind === 'one' ? [x.on.session] : []))
  const graded = sessionsToday.filter((s) => !isLocked(s.entry))
  const opt = days.find((d) => d.date === date)
  const dayIdx = days.findIndex((d) => d.date === date)
  const stats = dayAttendanceStats(cls.students, date)
  const hiddenData = hiddenWithData(r, allGroups, prefs, sessionsToday)
  let doneAll = 0, totalAll = 0
  for (const s of sessionsToday) { const p = rowProgress(r, s, allGroups); doneAll += p.done; totalAll += p.total }

  if (!cls.students.length) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp chưa có học sinh nào.</div>
  if (!isMongoid(cls.id)) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp này chưa lên server — chấm ở thẻ "Chấm từng em".</div>

  /** Ngày không đúng lịch mà cả lớp chưa ai có buổi → hỏi 1 lần "học bù thật?" (như Điểm danh nhanh). */
  function okForDay(): boolean {
    if (opt?.scheduled || sessionsToday.length > 0 || askedOffDay.current.has(date)) return true
    if (!confirm(`Lớp ${cls.name} không có lịch học ${weekdayLabel(date)} ${dm(date)} và chưa em nào có buổi ngày này. Tạo buổi sẽ tính học phí — đây là buổi học bù thật?`)) return false
    askedOffDay.current.add(date)
    return true
  }

  async function createFor(studentId: string, name: string) {
    if (!okForDay()) return
    if (!confirm(`${name} chưa có buổi ngày ${weekdayLabel(date)} ${dm(date)}. Tạo buổi mới (điểm danh "Đúng giờ") sẽ TÍNH VÀO HỌC PHÍ. Chỉ tạo nếu em có đi học hôm đó. Tạo?`)) return
    await w.create(studentId, date)
  }

  async function wholeClassPresent() {
    if (bulkRef.current) return
    const ids = stats.unmarked
    if (!ids.length) return
    bulkRef.current = true
    try {
      if (!okForDay()) return
      if (!confirm(`Ghi ĐÚNG GIỜ cho ${ids.length} em chưa có buổi ngày ${weekdayLabel(date)} ${dm(date)}? Mỗi em sẽ có thêm 1 buổi ngày này (tính vào học phí). ${sessionsToday.length} em đã có buổi giữ nguyên.`)) return
      setBulk(true)
      for (const id of ids) await w.create(id, date)
    } finally { bulkRef.current = false; setBulk(false) }
  }

  function edit(studentId: string, col: SheetColumn, value: string | boolean) {
    const res = w.mutate(studentId, date, (s) => applySheetEdit(r, s, col, value))
    if (!res.ok) toast.error(res.reason)
    return res.ok ? { ok: true } : { ok: false, reason: res.reason }
  }

  function tickAll(g: SheetGroup) {
    const ticks = g.cols.filter((c) => c.cell.kind === 'tick')
    const target = rows.filter((x) => x.on.kind === 'one' && !isLocked(x.on.session.entry) && ticks.some((c) => x.on.kind === 'one' && cellView(r, x.on.session, c).value !== true && !cellView(r, x.on.session, c).disabled))
    if (!target.length) { toast.info(`Mọi em có buổi ngày này đã tích đủ ${g.label}.`); return }
    if (!confirm(`Tích ĐỦ ${ticks.length} mục "${g.label}" cho ${target.length} em ngày ${dm(date)}? Mục đã tích giữ nguyên; em nghỉ không đổi.`)) return
    for (const x of target) w.mutate(x.studentId, date, (s) => {
      let changed = false
      for (const c of ticks) { const res = applySheetEdit(r, s, c, true); if (res.ok && res.changed) changed = true }
      return { ok: true, changed }
    })
  }

  function setDayMax(compKey: string, label: string, n: number) {
    const ids = rows.filter((x) => x.on.kind === 'one').map((x) => x.studentId)
    if (!ids.length) { toast.info('Chưa em nào có buổi ngày này.'); return false }
    if (!confirm(`Đặt "Số câu" ${label} = ${n} cho ${ids.length} em có buổi ngày ${dm(date)}? Tối đa của tiêu chí và tổng điểm tính lại theo ${n} câu (như ô "Số câu" ở Chấm từng em).`)) return false
    for (const id of ids) w.mutate(id, date, (s) => {
      if (s.maxes?.[compKey] === n) return { ok: true, changed: false }
      s.maxes = { ...(s.maxes ?? {}), [compKey]: n }
      s.dirty = true
      return { ok: true, changed: true }
    })
    return true
  }

  function pasteAt(rowIdx: number, colIdx: number, text: string) {
    const matrix = parsePaste(text)
    const plan = pasteTargets(rows.map((x) => ({ studentId: x.studentId, hasSession: x.on.kind === 'one' })), cols, { row: rowIdx, col: colIdx }, matrix)
    if (!plan.targets.length) { toast.error('Không có ô nào dán được ở đây (chỉ dán vào ô điểm / phần / kết quả / nhận xét của em đã có buổi).'); return }
    // Thử trước trên bản sao: 1 ô sai là KHÔNG ghi ô nào (không ghi nửa vời).
    const bad: string[] = []
    for (const t of plan.targets) {
      const row = rows.find((x) => x.studentId === t.studentId)
      const col = cols.find((x) => x.id === t.colId)
      if (!row || row.on.kind !== 'one' || !col) continue
      const copy = JSON.parse(JSON.stringify(row.on.session)) as Session
      const res = applySheetEdit(r, copy, col, t.raw)
      if (!res.ok) bad.push(`${row.name}: ${res.reason}`)
    }
    if (bad.length) { toast.error(`Chưa dán gì — ${bad.length} ô không hợp lệ: ${bad.slice(0, 3).join(' · ')}${bad.length > 3 ? '…' : ''}`, { persist: true }); return }
    const students = new Set(plan.targets.map((t) => t.studentId)).size
    if (plan.targets.length > 1 && !confirm(`Dán ${plan.targets.length} ô cho ${students} em ngày ${dm(date)}?${plan.skipped ? ` ${plan.skipped} ô bỏ qua (em chưa có buổi / cột không dán được / ngoài bảng).` : ''}`)) return
    for (const t of plan.targets) {
      const col = cols.find((x) => x.id === t.colId)
      if (col) w.mutate(t.studentId, date, (s) => applySheetEdit(r, s, col, t.raw))
    }
    toast.success(`Đã dán ${plan.targets.length} ô — đang gửi lên server.`)
  }

  function focusCell(rr: number, cc: number) {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-r="${rr}"][data-c="${cc}"]`)
    if (el) { el.focus(); return true }
    return false
  }
  function onNav(rr: number, cc: number) {
    return (e: ReactKeyboardEvent<HTMLElement>, atStart: boolean, atEnd: boolean) => {
      const move = (dr: number, dc: number) => {
        for (let i = 1; i <= rows.length + cols.length; i++) if (focusCell(rr + dr * i, cc + dc * i)) { e.preventDefault(); return }
      }
      if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); return }
      if (e.key === 'ArrowDown') return move(1, 0)
      if (e.key === 'ArrowUp') return move(-1, 0)
      if (e.key === 'ArrowRight' && atEnd) return move(0, 1)
      if (e.key === 'ArrowLeft' && atStart) return move(0, -1)
    }
  }

  function renderCell(row: Row, rIdx: number, col: SheetColumn, cIdx: number, big = false) {
    if (row.on.kind !== 'one') return null
    const s = row.on.session
    const v = cellView(r, s, col)
    const st = paintStyle(v.paint, oneColor, v.disabled && col.cell.kind !== 'att' && col.cell.kind !== 'note')
    const label = `${col.full} — ${row.name}`
    const nav = onNav(rIdx, cIdx)
    switch (col.cell.kind) {
      case 'att':
        return (
          <select data-r={rIdx} data-c={cIdx} data-col={col.id} aria-label={label} value={String(v.value)}
            onChange={(e) => edit(row.studentId, col, e.target.value)}
            onKeyDown={(e) => {
              const a = attFromKey(e.key)
              if (a) { e.preventDefault(); if (a !== v.value) edit(row.studentId, col, a); return }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') nav(e, true, true)
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); nav(e, true, true) }
            }}
            className={`${big ? 'h-12 text-sm' : 'h-9 text-[13px]'} rounded-lg px-1.5 font-bold outline-none focus:ring-[3px] focus:ring-blue-700`} style={st}>
            {Object.entries(ATT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )
      case 'choice':
        return (
          <select data-r={rIdx} data-c={cIdx} data-col={col.id} aria-label={label} value={String(v.value)} disabled={v.disabled}
            onChange={(e) => edit(row.studentId, col, e.target.value)}
            onKeyDown={(e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) { e.preventDefault(); nav(e, true, true) } }}
            className={`${big ? 'h-12 text-sm' : 'h-9 text-[13px]'} max-w-[150px] rounded-lg px-1.5 font-bold outline-none focus:ring-[3px] focus:ring-blue-700 disabled:cursor-not-allowed`} style={st}>
            <option value="">— chưa chọn</option>
            {(v.options ?? []).map((o) => <option key={o.id} value={o.id}>{o.label} ({o.pts})</option>)}
          </select>
        )
      case 'tick': case 'skip': {
        const on = v.value === true
        return (
          <button type="button" data-r={rIdx} data-c={cIdx} data-col={col.id} aria-label={label} aria-pressed={on} disabled={v.disabled} title={v.legacy ? 'Buổi chấm theo phiếu cũ — sửa ở Chấm từng em' : label}
            onClick={() => edit(row.studentId, col, !on)}
            onKeyDown={(e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) { e.preventDefault(); nav(e, true, true) } }}
            className={`${big ? 'h-12 w-12 text-xl' : 'h-9 w-10 text-lg'} rounded-lg font-black outline-none focus:ring-[3px] focus:ring-blue-700 disabled:cursor-not-allowed`}
            style={col.cell.kind === 'skip' && on ? paintStyle('zero', false, false) : st}>
            {on ? (col.cell.kind === 'skip' ? '✕' : '✓') : ''}
          </button>
        )
      }
      case 'note':
        return <TextCell value={String(v.value)} label={label} r={rIdx} c={cIdx} wide={big} colId={col.id} onCommit={(t) => edit(row.studentId, col, t)} onNav={nav} />
      default:
        return (
          <NumCell value={String(v.value)} max={v.max} style={st} disabled={v.disabled} label={label} r={rIdx} c={cIdx} big={big} colId={col.id}
            onCommit={(raw) => edit(row.studentId, col, raw)} onPaste={(t) => pasteAt(rIdx, cIdx, t)} onNav={nav} />
        )
    }
  }

  const totalOf = (s: Session) => sessionScore(s.entry, { ...r, comps: sessionComps(r, s) })
  const countFor = (g: SheetGroup) => {
    if (g.key === 'att') return `${sessionsToday.length}/${rows.length} em`
    if (g.key === 'note') return `${sessionsToday.filter((s) => s.entry.note?.trim()).length} em`
    const n = graded.filter((s) => g.cols.some((c) => cellView(r, s, c).paint !== 'empty')).length
    return `${n}/${graded.length} em`
  }
  const maxComps = r.comps.filter((c) => c.type === 'score' || (c.evidence ?? []).some((e) => e.type === 'ratio'))
  const detailRow = detail ? rows.find((x) => x.studentId === detail) : null

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-xl p-1" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button type="button" aria-label="Ngày học trước" disabled={dayIdx <= 0} onClick={() => setDate(days[dayIdx - 1].date)} className="h-9 w-9 rounded-lg text-lg disabled:opacity-40" style={{ color: C.ink }}>‹</button>
        <select aria-label="Chọn ngày" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-lg px-2 text-sm font-bold" style={{ color: C.ink, background: C.card }}>
          {days.map((d) => <option key={d.date} value={d.date}>{d.date === today ? 'Hôm nay · ' : ''}{weekdayLabel(d.date)} {dm(d.date)}/{d.date.slice(0, 4)}{!d.scheduled ? ' (không đúng lịch)' : ''}</option>)}
        </select>
        <button type="button" aria-label="Ngày học sau" disabled={dayIdx < 0 || dayIdx >= days.length - 1} onClick={() => setDate(days[dayIdx + 1].date)} className="h-9 w-9 rounded-lg text-lg disabled:opacity-40" style={{ color: C.ink }}>›</button>
      </div>
      <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]" style={{ background: C.card, border: `1px solid ${C.line}` }} data-testid="sheet-progress">
        <b style={{ color: C.ink }}>Đã nhập {doneAll}/{totalAll} ô</b>
        <span aria-hidden="true" className="inline-block h-2.5 w-28 overflow-hidden rounded-full" style={{ background: C.line }}><span className="block h-2.5" style={{ width: `${totalAll ? Math.round((doneAll / totalAll) * 100) : 0}%`, background: SHEET_PAINT.full.bg }} /></span>
        <span style={{ color: C.muted }}>{sessionsToday.length}/{rows.length} em có buổi</span>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <Btn size="sm" disabled={bulk || !stats.unmarked.length} loading={bulk} onClick={() => void wholeClassPresent()}>Cả lớp có mặt{stats.unmarked.length ? ` (${stats.unmarked.length} em chưa có buổi)` : ''}</Btn>
        <Btn size="sm" kind="outline-primary" onClick={() => setShowPrefs((x) => !x)}>⚙ Tùy chỉnh bảng</Btn>
      </div>
    </div>
  )

  const legend = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: C.muted }}>
      <b style={{ color: C.ink }}>Màu ô:</b>
      {(oneColor ? [['one', 'Đã nhập'], ['empty', 'Chưa nhập']] : [['full', 'Đủ điểm'], ['good', 'Khá (≥ 75%)'], ['mid', 'Trung bình (50–74%)'], ['low', 'Yếu (< 50%)'], ['zero', '0 điểm'], ['ticked', 'Đã tích'], ['text', 'Đã ghi nhận xét'], ['empty', 'Chưa nhập']]).map(([k, l]) => {
        const p = SHEET_PAINT[k as keyof typeof SHEET_PAINT]
        return <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-4 w-4 rounded" style={{ background: p.bg, border: p.bd, boxSizing: 'border-box' }} />{l}</span>
      })}
    </div>
  )

  const prefsPanel = showPrefs && (
    <div className="rounded-2xl p-4 shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }} data-testid="sheet-prefs">
      <div className="mb-1 font-bold" style={{ color: C.ink }}>Cột hiển thị <span className="text-xs font-normal" style={{ color: C.muted }}>— chỉ đổi cách xem trên máy này, không đổi điểm. Cột ẩn mà có dữ liệu vẫn được tính.</span></div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {allGroups.filter((g) => g.key !== 'att').map((g) => {
          const mid = allGroups.filter((x) => x.key !== 'att' && x.key !== 'note').map((x) => x.key)
          const order = arrangeGroups(allGroups, { hidden: [], order: prefs.order }).map((x) => x.key).filter((k) => mid.includes(k))
          const i = order.indexOf(g.key)
          const moveTo = (j: number) => { const o = [...order]; o.splice(i, 1); o.splice(j, 0, g.key); setPrefs({ ...prefs, order: o }) }
          const groupOn = !prefs.hidden.includes(g.key)
          const toggle = (id: string) => setPrefs({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((x) => x !== id) : [...prefs.hidden, id] })
          return (
            <div key={g.key} className="rounded-xl p-2.5" style={{ border: `1px solid ${C.line}`, background: groupOn ? C.card : C.paper }}>
              <div className="flex items-center gap-2">
                <label className="flex min-h-9 items-center gap-2 text-sm font-bold" style={{ color: C.ink }}><input type="checkbox" className="h-5 w-5" checked={groupOn} onChange={() => toggle(g.key)} /> {g.label}{g.max != null ? ` · ${g.max}` : ''}</label>
                {g.key !== 'note' && (
                  <span className="ml-auto flex gap-1">
                    <button type="button" aria-label={`Đưa ${g.label} lên`} disabled={i <= 0} onClick={() => moveTo(i - 1)} className="h-8 w-8 rounded-lg text-sm disabled:opacity-40" style={{ border: `1px solid ${C.line}` }}>↑</button>
                    <button type="button" aria-label={`Đưa ${g.label} xuống`} disabled={i < 0 || i >= order.length - 1} onClick={() => moveTo(i + 1)} className="h-8 w-8 rounded-lg text-sm disabled:opacity-40" style={{ border: `1px solid ${C.line}` }}>↓</button>
                  </span>
                )}
              </div>
              {g.cols.length > 1 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-7">
                  {g.cols.map((c) => <label key={c.id} className="flex min-h-8 items-center gap-1.5 text-[13px]" style={{ color: C.ink }}><input type="checkbox" className="h-4 w-4" checked={!prefs.hidden.includes(c.id)} disabled={!groupOn} onChange={() => toggle(c.id)} /> {c.label}</label>)}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: C.ink }}>
        <span className="font-bold">Màu ô đã nhập:</span>
        <label className="flex min-h-9 items-center gap-1.5"><input type="radio" name="sheet-color" checked={!oneColor} onChange={() => setPrefs({ ...prefs, color: 'level' })} /> Theo mức điểm</label>
        <label className="flex min-h-9 items-center gap-1.5"><input type="radio" name="sheet-color" checked={oneColor} onChange={() => setPrefs({ ...prefs, color: 'one' })} /> Một màu</label>
        <label className="flex min-h-9 items-center gap-1.5"><input type="checkbox" checked={prefs.progress} onChange={() => setPrefs({ ...prefs, progress: !prefs.progress })} /> Hiện "đã nhập x/y ô" từng em</label>
        <Btn size="sm" kind="ghost" onClick={() => setPrefs({ ...DEFAULT_PREFS })}>Về mặc định</Btn>
      </div>
      <div className="mt-2 text-xs" style={{ color: C.muted }}>Sửa tiêu chí chấm (đổi tên, đổi điểm, thêm mục) làm ở Admin › Tiêu chí chấm — sắp có ngay ở đây (đợt 2).</div>
    </div>
  )

  const banner = (
    <>
      {hiddenData.length > 0 && (
        <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: '#FFFBEB', border: `1px solid ${C.gold}`, color: C.ink }} data-testid="hidden-data">
          {hiddenData.length} cột đang ẩn có dữ liệu ngày này (vẫn được tính vào tổng): {hiddenData.slice(0, 4).join(', ')}{hiddenData.length > 4 ? '…' : ''}
        </div>
      )}
    </>
  )

  const rowStatus = (row: Row) => statusText(w.status(row.studentId, date), row.on.kind === 'one' ? row.on.session : null)
  const progressOf = (s: Session) => rowProgress(r, s, allGroups)

  const detailPanel = detailRow && detailRow.on.kind === 'one' && (() => {
    const s = detailRow.on.session
    const st = cls.students.find((x) => x.id === detailRow.studentId)
    return (
      <aside aria-label={`Chi tiết ${detailRow.name}`} className="space-y-3 rounded-2xl p-4 shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }} data-testid="sheet-detail">
        <div className="flex items-start gap-2">
          <div>
            <div className="text-base font-extrabold" style={{ color: C.ink }}>{detailRow.name}</div>
            <div className="text-xs" style={{ color: C.muted }}>{weekdayLabel(date)} {dm(date)} · {sessionLabelOf(s.no, cls.perMonth, st?.sessionOffset)}</div>
          </div>
          <button type="button" aria-label="Đóng chi tiết" onClick={() => setDetail(null)} className="ml-auto h-9 w-9 rounded-lg" style={{ border: `1px solid ${C.line}` }}>×</button>
        </div>
        {isLocked(s.entry) && <div className="text-sm" style={{ color: C.muted }}>Em nghỉ buổi này — không chấm tiêu chí.</div>}
        {!isLocked(s.entry) && sessionComps(r, s).map((comp) => {
          const texts = (comp.evidence ?? []).filter((e) => e.type !== 'ratio')
          if (!texts.length && !comp.tags?.length) return null
          const tags = (s.entry.tags?.[comp.key] ?? []) as string[]
          return (
            <div key={comp.key} className="space-y-1.5">
              <div className="text-xs font-bold uppercase" style={{ color: C.board }}>{comp.label}</div>
              {comp.tags?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {comp.tags.map((t) => {
                    const on = tags.includes(t.id)
                    const p = on ? (t.good ? SHEET_PAINT.full : SHEET_PAINT.zero) : SHEET_PAINT.empty
                    return <button key={t.id} type="button" aria-pressed={on} onClick={() => { const res = w.mutate(detailRow.studentId, date, (x) => toggleTag(r, x, comp.key, t.id)); if (!res.ok) toast.error(res.reason) }} className="min-h-9 rounded-full px-3 text-[13px] font-semibold" style={{ background: p.bg, color: p.fg, border: p.bd }}>{t.label}</button>
                  })}
                </div>
              ) : null}
              {texts.map((ev) => {
                const cur = (s.entry.ev?.[comp.key]?.[ev.key] as string | undefined) ?? ''
                return (
                  <label key={ev.key} className="block text-[13px]" style={{ color: C.muted }}>{ev.label}
                    <EvidenceInput value={cur} placeholder={ev.ph ?? 'ngăn cách bằng dấu phẩy'} onCommit={(v) => { const res = w.mutate(detailRow.studentId, date, (x) => applyEvidenceText(x, comp.key, ev.key, v)); if (!res.ok) toast.error(res.reason) }} />
                  </label>
                )
              })}
            </div>
          )
        })}
        {s.homework?.trim() ? <div className="text-[13px]" style={{ color: C.muted }}>Bài tập về nhà: <span style={{ color: C.ink }}>{s.homework}</span></div> : null}
        <Btn kind="solid" className="w-full" onClick={() => onOpenEntry(detailRow.studentId, s.no)}>Mở "Chấm từng em" cho em này →</Btn>
      </aside>
    )
  })()

  // ── Điện thoại: chấm theo TỪNG TIÊU CHÍ cho cả lớp ────────────────────────
  if (phone && !phoneTable) {
    const g = groups.find((x) => x.key === crit) ?? groups[0]
    const gi = groups.indexOf(g)
    return (
      <div className="space-y-3" ref={tableRef}>
        {header}
        {prefsPanel}
        {banner}
        <nav aria-label="Chọn tiêu chí" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {groups.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === g.key} onClick={() => setCrit(x.key)} className="h-10 shrink-0 rounded-full px-3.5 text-sm font-bold"
              style={x.key === g.key ? { background: C.board, color: '#fff', border: `1px solid ${C.board}` } : { background: C.card, color: C.ink, border: `1px solid ${C.line}` }}>
              {x.label}{x.max != null ? ` · ${x.max}` : ''}
            </button>
          ))}
        </nav>
        <div className="flex items-baseline gap-2"><b style={{ color: C.ink }}>{g.label}</b><span className="text-xs" style={{ color: C.muted }}>{countFor(g)}</span>
          {g.cols.some((c) => c.cell.kind === 'tick') && <button type="button" onClick={() => tickAll(g)} className="ml-auto text-sm font-bold" style={{ color: C.board2 }}>Tích đủ cả lớp</button>}
        </div>
        <div className="space-y-2">
          {rows.map((row, rIdx) => {
            const s = row.on.kind === 'one' ? row.on.session : null
            const t = s ? totalOf(s) : null
            const stt = rowStatus(row)
            return (
              <div key={row.studentId} data-sheet-student={row.name} className="rounded-2xl p-3" style={{ background: C.card, border: `1px solid ${stt.color === C.rose ? C.rose : C.line}` }}>
                <div className="flex items-center gap-2">
                  <b className="truncate" style={{ color: C.ink }}>{row.name}</b>
                  <span className="ml-auto text-xs font-bold" style={{ color: stt.color }}>{stt.text}</span>
                  {s && <span className="min-w-10 rounded-lg px-1.5 py-0.5 text-center text-sm font-black" style={totalStyle(t)}>{t ?? '—'}</span>}
                </div>
                {row.on.kind === 'none' && (
                  <button type="button" onClick={() => void createFor(row.studentId, row.name)} className="mt-2 h-11 w-full rounded-xl text-sm" style={{ border: `1px dashed ${C.muted}`, color: C.ink }}>+ Chưa có buổi ngày này — tạo buổi</button>
                )}
                {row.on.kind === 'dup' && <div className="mt-2 text-sm" style={{ color: C.rose }}>Có {row.on.count} buổi cùng ngày — sửa ở "🔧 Sửa số buổi" trước.</div>}
                {s && g.key !== 'att' && g.key !== 'note' && isLocked(s.entry) && <div className="mt-2 rounded-lg p-2 text-sm" style={{ background: C.paper, color: C.muted }}>{s.entry.attendance === 'absent' ? 'Nghỉ không phép — 0 điểm, không chấm tiêu chí.' : 'Nghỉ có phép — buổi này không chấm.'}</div>}
                {s && !(g.key !== 'att' && g.key !== 'note' && isLocked(s.entry)) && (
                  <div className="mt-2 flex flex-wrap items-end gap-2">
                    {g.cols.map((c) => {
                      const cIdx = cols.indexOf(c)
                      return (
                        <label key={c.id} className={`flex flex-col items-center gap-1 text-xs ${c.cell.kind === 'note' ? 'w-full items-stretch' : ''}`} style={{ color: C.muted }}>
                          {c.cell.kind !== 'note' && c.cell.kind !== 'att' && <span className="max-w-[90px] truncate" title={c.full}>{c.label} {c.hint}</span>}
                          {renderCell(row, rIdx, c, cIdx, true)}
                        </label>
                      )
                    })}
                    <button type="button" onClick={() => setDetail(row.studentId)} className="ml-auto h-9 rounded-lg px-2 text-xs font-bold" style={{ color: C.board2, border: `1px solid ${C.line}` }}>Chi tiết</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {detailPanel}
        <div className="sticky bottom-2 flex items-center gap-2 rounded-2xl p-2 shadow" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <Btn size="sm" kind="ghost" disabled={gi <= 0} onClick={() => setCrit(groups[gi - 1].key)}>‹ Trước</Btn>
          <span className="flex-1 text-center text-xs" style={{ color: C.muted }}>Tiêu chí {gi + 1}/{groups.length}</span>
          <Btn size="sm" disabled={gi >= groups.length - 1} onClick={() => setCrit(groups[gi + 1].key)}>Tiêu chí sau ›</Btn>
        </div>
        <button type="button" onClick={() => setPhoneTable(true)} className="w-full text-center text-sm font-bold" style={{ color: C.board2 }}>Xem cả bảng (cuộn ngang)</button>
      </div>
    )
  }

  // ── Máy tính (và "Xem cả bảng" trên điện thoại): bảng như Google Sheets ────
  return (
    <div className="space-y-3">
      {header}
      {legend}
      {prefsPanel}
      {banner}
      {phone && <button type="button" onClick={() => setPhoneTable(false)} className="text-sm font-bold" style={{ color: C.board2 }}>‹ Chấm theo từng tiêu chí</button>}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-2xl shadow-sm" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="overflow-x-auto" ref={tableRef}>
            <table className="border-separate border-spacing-0 text-[13px]" data-testid="grade-sheet">
              <thead>
                <tr>
                  <th rowSpan={3} className="sticky left-0 z-20 min-w-[160px] px-3 text-left align-bottom" style={{ background: C.paper, borderRight: `2px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, color: C.ink }}>Học sinh</th>
                  {groups.map((g) => (
                    <th key={g.key} colSpan={g.cols.length} className="px-2 py-1.5 text-center text-[13px] font-bold" style={{ background: g.key === 'att' || g.key === 'note' ? C.paper : '#EEF2FF', color: C.board, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                      {g.label}{g.max != null ? ` · ${g.max}` : ''} <span className="font-medium" style={{ color: C.muted }}>· {countFor(g)}</span>
                      {g.cols.some((c) => c.cell.kind === 'tick') && <button type="button" onClick={() => tickAll(g)} className="ml-2 rounded-md px-1.5 text-[11px] font-bold" style={{ color: C.board2, border: `1px solid ${C.line}`, background: C.card }}>Tích đủ cả lớp</button>}
                    </th>
                  ))}
                  <th rowSpan={3} className="px-2 align-bottom" style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, color: C.ink }}>Tổng<br />/100</th>
                  <th rowSpan={3} className="px-2 align-bottom" style={{ background: C.paper, borderBottom: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, color: C.ink }}>Lưu</th>
                  <th rowSpan={3} style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}><span className="sr-only">Chi tiết</span></th>
                </tr>
                <tr>
                  {groups.flatMap((g) => g.cols).map((c) => (
                    <th key={c.id} title={c.full} className="px-1.5 py-1 text-center text-[12px] font-semibold" style={{ background: C.paper, color: C.ink, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                      {c.label}{c.hint ? <><br /><span className="font-normal" style={{ color: C.muted }}>{c.hint}</span></> : null}
                    </th>
                  ))}
                </tr>
                <tr>
                  {groups.map((g) => {
                    const comp = maxComps.find((x) => x.key === g.key)
                    if (!comp) return <th key={g.key} colSpan={g.cols.length} style={{ background: C.paper, borderRight: `1px solid ${C.line}`, borderBottom: `2px solid ${C.line}` }} />
                    const dmx = dayMaxOf(comp, sessionsToday)
                    return (
                      <th key={g.key} colSpan={g.cols.length} className="px-2 py-1 text-[12px] font-medium" style={{ background: dmx.custom ? '#FFFBEB' : C.paper, color: C.muted, borderRight: `1px solid ${C.line}`, borderBottom: `2px solid ${C.line}` }}>
                        Số câu buổi này{' '}
                        <SheetMaxInput value={dmx.value} label={`Số câu ${comp.label} ngày ${dm(date)}`} onCommit={(n) => setDayMax(comp.key, comp.label, n)} />
                        {dmx.mixed ? <span style={{ color: C.amber }}> (mỗi em khác nhau)</span> : dmx.custom ? <span style={{ color: C.amber }}> (đổi từ {comp.max})</span> : null}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => {
                  const s = row.on.kind === 'one' ? row.on.session : null
                  const t = s ? totalOf(s) : null
                  const stt = rowStatus(row)
                  const pr = s ? progressOf(s) : null
                  const rowBg = detail === row.studentId ? '#EFF6FF' : s && isLocked(s.entry) ? C.paper : C.card
                  return (
                    <tr key={row.studentId} data-sheet-student={row.name} style={{ background: rowBg }}>
                      <td className="sticky left-0 z-10 px-3 py-1" style={{ background: rowBg, borderRight: `2px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                        <div className="font-semibold" style={{ color: C.ink }}>{row.name}</div>
                        {s && prefs.progress && pr && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span aria-hidden="true" className="inline-block h-1.5 w-16 overflow-hidden rounded-full" style={{ background: C.line }}><span className="block h-1.5" style={{ width: `${Math.round((pr.done / pr.total) * 100)}%`, background: pr.done === pr.total ? SHEET_PAINT.full.bg : C.gold }} /></span>
                            <span className="text-[11px]" style={{ color: C.muted }}>{isLocked(s.entry) ? ATT_LABEL[s.entry.attendance].toLowerCase() : `${pr.done}/${pr.total} ô`}</span>
                          </div>
                        )}
                        {!s && <div className="text-[11px]" style={{ color: C.muted }}>{row.on.kind === 'dup' ? `${row.on.count} buổi cùng ngày` : 'chưa có buổi ngày này'}</div>}
                      </td>
                      {s ? (
                        <>
                          {cols.map((c, cIdx) => <td key={c.id} className="px-1 py-1 text-center" style={{ borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>{renderCell(row, rIdx, c, cIdx)}</td>)}
                          <td className="px-1.5 text-center" style={{ borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}><span className="inline-block min-w-10 rounded-lg px-1.5 py-1 text-[15px] font-black" style={totalStyle(t)} data-testid="row-total">{t ?? '—'}</span></td>
                          <td className="min-w-[140px] max-w-[220px] px-2 text-[12px] font-bold leading-tight" style={{ color: stt.color, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }} data-testid="row-status">{stt.text}</td>
                          <td className="px-1.5" style={{ borderBottom: `1px solid ${C.line}` }}><button type="button" onClick={() => setDetail(row.studentId)} className="h-8 rounded-lg px-2 text-xs font-bold" style={{ color: C.board, border: `1px solid ${C.line}`, background: C.card }}>Chi tiết</button></td>
                        </>
                      ) : (
                        <td colSpan={cols.length + 3} className="px-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}>
                          {row.on.kind === 'none'
                            ? <><button type="button" onClick={() => void createFor(row.studentId, row.name)} className="h-8 rounded-lg px-3 text-[13px]" style={{ border: `1px dashed ${C.muted}`, color: C.ink, background: C.card }}>+ Tạo buổi {dm(date)} cho em này</button><span className="ml-2 text-xs" style={{ color: C.muted }}>Tạo buổi = tính học phí, sẽ hỏi lại trước khi tạo.</span></>
                            : <span className="text-[13px]" style={{ color: C.rose }}>Có {row.on.kind === 'dup' ? row.on.count : 2} buổi cùng ngày — sửa ở "🔧 Sửa số buổi" trước (trùng ngày làm học phí đếm dư).</span>}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs" style={{ background: C.paper, color: C.muted, borderTop: `1px solid ${C.line}` }}>
            <span><b>Enter</b> xuống ô dưới</span><span><b>← ↑ → ↓</b> di chuyển</span><span><b>đ / m / p / k</b> điểm danh</span><span><b>Space</b> tích ô</span><span><b>Ctrl+V</b> dán cả cột từ Google Sheets / Excel</span><span><b>Esc</b> hủy ô đang gõ</span><span>Gõ xong ô mới lưu · ✓ chỉ hiện khi server đã nhận</span>
          </div>
        </div>
        {detailPanel && <div className="flex-[1_1_300px] md:max-w-[380px]">{detailPanel}</div>}
      </div>
    </div>
  )
}

function EvidenceInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [draft, setDraftState] = useState(value)
  const draftRef = useRef(value)
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(value) }, [value])
  const p = draft.trim() ? SHEET_PAINT.text : SHEET_PAINT.empty
  return (
    <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draftRef.current !== value) onCommit(draftRef.current) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() } }}
      className="mt-1 h-10 w-full rounded-lg px-2.5 text-sm" style={{ background: p.bg, color: p.fg, border: p.bd }} />
  )
}

function SheetMaxInput({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => boolean }) {
  const [draft, setDraftState] = useState(String(value))
  // Đọc giá trị đang gõ qua ref: Esc gọi blur ngay, đọc state là lưu luôn số gõ dở (gotcha DateCommitInput).
  const draftRef = useRef(String(value))
  const setDraft = (v: string) => { draftRef.current = v; setDraftState(v) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(String(value)) }, [value])
  return (
    <input type="text" inputMode="numeric" aria-label={label} value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={() => { const raw = draftRef.current, n = Number(raw); if (!raw || !Number.isInteger(n) || n < 1 || n === value || !onCommit(n)) setDraft(String(value)) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); e.currentTarget.blur() } }}
      className="h-7 w-12 rounded-md text-center font-bold" style={{ border: `1px dashed ${C.muted}`, background: C.card, color: C.ink }} />
  )
}
