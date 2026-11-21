// Bảng chấm điểm kiểu Google Sheets (21/11, đợt 1): cột = đúng tiêu chí phiếu chấm của lớp, mỗi
// dòng = 1 em, 1 NGÀY. Thuần, có test. Chỉ sửa KHO MÁY (trong `update` của immer) theo ĐÚNG cách
// màn "Chấm từng em" đang ghi (CompEditor/EvidenceFields); gửi lên server luôn qua `pushSession`.
// Không đổi cách tính điểm: mọi tổng/tối đa đi qua `sessionComps` + `sessionScore` hiện có.
import type { AttendanceKey, RubricComponent, RubricDef, Session, SessionEntry } from '@/types'
import { sessionComps } from './scoring'

export type SheetCell =
  | { kind: 'att' }
  | { kind: 'score'; comp: string }
  | { kind: 'choice'; comp: string }
  | { kind: 'part'; comp: string; part: string }
  | { kind: 'skip'; comp: string }
  | { kind: 'tick'; comp: string; item: string }
  | { kind: 'ratio'; comp: string; ev: string }
  | { kind: 'note' }

export interface SheetColumn {
  id: string
  cell: SheetCell
  /** Tiêu đề cột (ngắn) + chú thích dưới (VD "/10", "4đ"). */
  label: string
  hint: string
  /** Tên đầy đủ (title/aria) — VD mục tích việc dài. */
  full: string
}

export interface SheetGroup { key: string; label: string; max: number | null; cols: SheetColumn[] }

const short = (s: string, n = 14) => {
  const first = s.split(/[,;(]/)[0].trim()
  return first.length <= n ? first : `${first.slice(0, n - 1).trimEnd()}…`
}

/** Cột theo phiếu chấm của LỚP (`getClassRubric` — đã gồm tiêu chí admin ẩn/thêm/đổi tên/đổi điểm). */
export function sheetGroups(r: Pick<RubricDef, 'comps'>): SheetGroup[] {
  const groups: SheetGroup[] = [{ key: 'att', label: 'Điểm danh', max: null, cols: [{ id: 'att', cell: { kind: 'att' }, label: 'Điểm danh', hint: '', full: 'Điểm danh' }] }]
  for (const c of r.comps) {
    const cols: SheetColumn[] = []
    if (c.type === 'score') cols.push({ id: `${c.key}:score`, cell: { kind: 'score', comp: c.key }, label: 'Điểm', hint: `/${c.max}`, full: c.label })
    if (c.type === 'choice') cols.push({ id: `${c.key}:choice`, cell: { kind: 'choice', comp: c.key }, label: 'Mức', hint: '', full: c.label })
    if (c.type === 'parts') {
      for (const p of c.parts ?? []) cols.push({ id: `${c.key}:part:${p.id}`, cell: { kind: 'part', comp: c.key, part: p.id }, label: short(p.label), hint: `/${p.max}`, full: `${c.label} · ${p.label}` })
      if (c.zeroLabel) cols.push({ id: `${c.key}:skip`, cell: { kind: 'skip', comp: c.key }, label: 'Không nộp', hint: '0đ', full: `${c.label} · ${c.zeroLabel}` })
    }
    if (c.type === 'ticks') {
      for (const it of c.items ?? []) cols.push({ id: `${c.key}:tick:${it.id}`, cell: { kind: 'tick', comp: c.key, item: it.id }, label: short(it.label, 12), hint: `${it.pts}đ`, full: `${c.label} · ${it.label}` })
    }
    for (const ev of c.evidence ?? []) {
      if (ev.type === 'ratio') cols.push({ id: `${c.key}:ratio:${ev.key}`, cell: { kind: 'ratio', comp: c.key, ev: ev.key }, label: ev.label, hint: ev.unit ?? 'câu đúng', full: `${c.label} · ${ev.label}` })
    }
    groups.push({ key: c.key, label: c.label, max: c.max, cols })
  }
  groups.push({ key: 'note', label: 'Nhận xét', max: null, cols: [{ id: 'note', cell: { kind: 'note' }, label: 'Nhận xét', hint: '', full: 'Nhận xét' }] })
  return groups
}

export type Paint = 'empty' | 'full' | 'good' | 'mid' | 'low' | 'zero' | 'ticked' | 'text' | 'present' | 'late' | 'excused' | 'absent'

/** Màu ô theo mức đạt (đã nhập mới tô; trống = 'empty'). */
export function paintFor(value: number | null, max: number): Paint {
  if (value == null) return 'empty'
  if (max <= 0) return value > 0 ? 'full' : 'zero'
  const p = value / max
  if (p >= 1) return 'full'
  if (p >= 0.75) return 'good'
  if (p >= 0.5) return 'mid'
  if (p > 0) return 'low'
  return 'zero'
}

export const isLocked = (e: Pick<SessionEntry, 'attendance'> | undefined) => e?.attendance === 'absent' || e?.attendance === 'excused'

/** Mẫu số "Kết quả x/y" — Y HỆT `EvidenceFields`: tổng đã ghi ở ô đó, không có thì "Số câu" của
 *  tiêu chí buổi đó, không có nữa thì 20. */
export function ratioTotalOf(session: Pick<Session, 'entry' | 'maxes'>, comp: string, ev: string): number {
  const v = session.entry.ev?.[comp]?.[ev] as { total?: string | number } | undefined
  const t = Number(v?.total ?? session.maxes?.[comp] ?? 20)
  return Number.isFinite(t) && t > 0 ? t : 20
}

export interface CellView {
  value: string | boolean
  /** Số tối đa của ô (điểm, phần, số câu) — theo "Số câu" của ĐÚNG buổi đó. */
  max?: number
  options?: Array<{ id: string; label: string; pts: number }>
  paint: Paint
  /** Khóa: nghỉ có phép / không phép, video "Không nộp", hoặc buổi dùng phiếu cũ (`legacy`). */
  disabled: boolean
  legacy?: boolean
}

const numOrNull = (v: unknown): number | null => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))

/** Giá trị + màu + khóa của 1 ô cho 1 buổi. `r` = phiếu của lớp (`getClassRubric`). */
export function cellView(r: Pick<RubricDef, 'comps'>, session: Pick<Session, 'entry' | 'maxes'>, col: SheetColumn): CellView {
  const e = session.entry
  const cell = col.cell
  if (cell.kind === 'att') return { value: e.attendance, paint: e.attendance, disabled: false }
  if (cell.kind === 'note') return { value: e.note ?? '', paint: e.note?.trim() ? 'text' : 'empty', disabled: false }
  const locked = isLocked(e)
  const base = r.comps.find((c) => c.key === cell.comp)
  const comp = sessionComps(r, session).find((c) => c.key === cell.comp)
  if (!base || !comp) return { value: '', paint: 'empty', disabled: true }
  // Buổi cũ chấm theo định nghĩa cũ (VD Thái độ Cấp 1 trước 06/10 — resolveComp) → không sửa ở bảng.
  if (comp.type !== base.type) return { value: '', paint: 'empty', disabled: true, legacy: true }
  switch (cell.kind) {
    case 'score': {
      const v = numOrNull(e.scores?.[cell.comp])
      return { value: v == null ? '' : String(v), max: comp.max, paint: paintFor(v, comp.max), disabled: locked }
    }
    case 'choice': {
      const id = e.choice?.[cell.comp] ?? ''
      const o = comp.options?.find((x) => x.id === id)
      return { value: id, options: (comp.options ?? []).map((x) => ({ id: x.id, label: x.label, pts: x.pts })), paint: o ? paintFor(o.pts, comp.max) : 'empty', disabled: locked }
    }
    case 'part': {
      const p = comp.parts?.find((x) => x.id === cell.part)
      const skipped = !!e.skip?.[cell.comp]
      const v = numOrNull(e.parts?.[cell.comp]?.[cell.part])
      return { value: skipped || v == null ? '' : String(v), max: p?.max ?? 0, paint: skipped ? 'empty' : paintFor(v, p?.max ?? 0), disabled: locked || skipped || !p }
    }
    case 'skip': {
      const on = !!e.skip?.[cell.comp]
      return { value: on, paint: on ? 'zero' : 'empty', disabled: locked }
    }
    case 'tick': {
      const on = (e.ticks?.[cell.comp] ?? []).includes(cell.item)
      return { value: on, paint: on ? 'ticked' : 'empty', disabled: locked }
    }
    case 'ratio': {
      const total = ratioTotalOf(session, cell.comp, cell.ev)
      const v = numOrNull((e.ev?.[cell.comp]?.[cell.ev] as { ok?: unknown } | undefined)?.ok)
      return { value: v == null ? '' : String(v), max: total, paint: paintFor(v, total), disabled: locked }
    }
  }
}

/** Đọc số gõ vào ô: "" = xóa; "7,5" = 7.5. */
export function parseCellNumber(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim().replace(',', '.')
  if (!t) return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false }
  return { ok: true, value: Number(t) }
}

export type EditValue = string | boolean

const ensure = (e: SessionEntry) => {
  for (const k of ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev'] as const) {
    if (!e[k]) (e as unknown as Record<string, unknown>)[k] = {}
  }
}

/** Ghi 1 ô vào buổi (sửa TRỰC TIẾP `session` — gọi trong immer `update`). Kiểm tra thang điểm theo
 *  "Số câu" của đúng buổi đó; sai thì KHÔNG đổi gì, trả lời báo nêu ô + tối đa. Đổi thật thì đặt
 *  `dirty` (chờ server xác nhận), giống `findOrCreateSession` ở Chấm từng em. */
export function applySheetEdit(
  r: Pick<RubricDef, 'comps'>,
  session: Session,
  col: SheetColumn,
  value: EditValue,
): { ok: true; changed: boolean } | { ok: false; reason: string } {
  const view = cellView(r, session, col)
  if (view.legacy) return { ok: false, reason: `${col.full}: buổi này chấm theo phiếu cũ — sửa ở "Chấm từng em".` }
  if (view.disabled && col.cell.kind !== 'att' && col.cell.kind !== 'note') {
    return { ok: false, reason: isLocked(session.entry) ? 'Em nghỉ buổi này — không chấm tiêu chí.' : `${col.full}: ô đang khóa.` }
  }
  const e = session.entry
  ensure(e)
  const before = JSON.stringify(e)
  const cell = col.cell
  const num = (): number | null | string => {
    const p = parseCellNumber(String(value))
    if (!p.ok) return `${col.full}: "${String(value)}" không phải số.`
    if (p.value != null && view.max != null && p.value > view.max) return `${col.full}: tối đa ${view.max}, đã gõ ${p.value}.`
    return p.value
  }
  switch (cell.kind) {
    case 'att': {
      const a = String(value) as AttendanceKey
      if (!['present', 'late', 'excused', 'absent'].includes(a)) return { ok: false, reason: 'Điểm danh không hợp lệ.' }
      e.attendance = a
      break
    }
    case 'note':
      e.note = String(value)
      break
    case 'score': {
      const n = num(); if (typeof n === 'string') return { ok: false, reason: n }
      if (n == null) delete e.scores[cell.comp]; else e.scores[cell.comp] = n
      break
    }
    case 'part': {
      const n = num(); if (typeof n === 'string') return { ok: false, reason: n }
      const m = { ...(e.parts[cell.comp] ?? {}) }
      if (n == null) delete m[cell.part]; else m[cell.part] = n
      if (Object.keys(m).length) e.parts[cell.comp] = m; else delete e.parts[cell.comp]
      break
    }
    case 'ratio': {
      const n = num(); if (typeof n === 'string') return { ok: false, reason: n }
      const prev = (e.ev[cell.comp]?.[cell.ev] ?? undefined) as { ok?: string | number; total?: string | number } | undefined
      const total = view.max ?? 20
      const next = { ...(e.ev[cell.comp] ?? {}) } as Record<string, unknown>
      if (n == null) {
        if (!prev || prev.ok === '' || prev.ok == null) break
        next[cell.ev] = { ...prev, ok: '' }
      } else next[cell.ev] = { total, ...prev, ok: n }
      e.ev[cell.comp] = next as SessionEntry['ev'][string]
      break
    }
    case 'choice': {
      const id = String(value)
      const opts = view.options ?? []
      if (id && !opts.some((o) => o.id === id)) return { ok: false, reason: `${col.full}: mức không có trong phiếu.` }
      if (id) e.choice[cell.comp] = id; else delete e.choice[cell.comp]
      break
    }
    case 'tick': {
      const on = value === true || value === 'true'
      const cur = e.ticks[cell.comp] ?? []
      if (cur.includes(cell.item) === on) break
      const a = cur.filter((x) => x !== cell.item)
      e.ticks[cell.comp] = on ? [...a, cell.item] : a
      break
    }
    case 'skip': {
      const on = value === true || value === 'true'
      if (!!e.skip[cell.comp] === on) break
      e.skip[cell.comp] = on
      break
    }
  }
  const changed = JSON.stringify(session.entry) !== before
  if (changed) session.dirty = true
  return { ok: true, changed }
}

/** Ô cần nhập của 1 em (thanh "đã nhập x/y ô"): mỗi tiêu chí điểm/mức/kết quả 1 ô, mỗi phần 1 ô
 *  ("Không nộp" = đủ cả tiêu chí), tiêu chí tích việc tính 1 ô khi đã tích ít nhất 1 mục. Nhận xét
 *  không bắt buộc. Nghỉ = đủ (không chấm). */
export function rowProgress(r: Pick<RubricDef, 'comps'>, session: Pick<Session, 'entry' | 'maxes'>, groups: SheetGroup[]): { done: number; total: number } {
  let done = 1, total = 1 // điểm danh: có buổi là đã có
  const locked = isLocked(session.entry)
  for (const g of groups) {
    if (g.key === 'att' || g.key === 'note') continue
    const skip = g.cols.find((c) => c.cell.kind === 'skip')
    const skipped = skip ? cellView(r, session, skip).value === true : false
    const ticks = g.cols.filter((c) => c.cell.kind === 'tick')
    const others = g.cols.filter((c) => c.cell.kind !== 'tick' && c.cell.kind !== 'skip')
    if (ticks.length) { total++; if (locked || ticks.some((c) => cellView(r, session, c).value === true)) done++ }
    for (const c of others) {
      total++
      if (locked || (skipped && c.cell.kind === 'part') || cellView(r, session, c).paint !== 'empty') done++
    }
  }
  return { done, total }
}

/** Ô trong 1 dòng/cột có thể DÁN số vào (Ctrl+V từ Google Sheets / Excel). */
export const pastable = (c: SheetColumn) => c.cell.kind === 'score' || c.cell.kind === 'part' || c.cell.kind === 'ratio' || c.cell.kind === 'note'

/** Văn bản dán từ bảng tính → ma trận ô (tab ngăn cột, xuống dòng ngăn dòng, bỏ dòng trống cuối). */
export function parsePaste(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.map((l) => l.split('\t'))
}

/** Gắn ma trận dán vào ô bắt đầu: chỉ tới ô có trong bảng; cột không dán được (tích, mức, điểm danh)
 *  hoặc dòng không có buổi thì bỏ qua + đếm để báo. */
export function pasteTargets(
  rows: Array<{ studentId: string; hasSession: boolean }>,
  cols: SheetColumn[],
  start: { row: number; col: number },
  matrix: string[][],
): { targets: Array<{ studentId: string; colId: string; raw: string }>; skipped: number } {
  const targets: Array<{ studentId: string; colId: string; raw: string }> = []
  let skipped = 0
  matrix.forEach((line, i) => {
    const row = rows[start.row + i]
    line.forEach((raw, j) => {
      const col = cols[start.col + j]
      if (!row || !col) { skipped++; return }
      if (!row.hasSession || !pastable(col)) { skipped++; return }
      targets.push({ studentId: row.studentId, colId: col.id, raw })
    })
  })
  return { targets, skipped }
}

/** Phím tắt cột Điểm danh: đ/d = đúng giờ, m = muộn, p = có phép, k = không phép. */
export function attFromKey(key: string): AttendanceKey | null {
  const k = key.toLowerCase()
  if (k === 'đ' || k === 'd') return 'present'
  if (k === 'm') return 'late'
  if (k === 'p') return 'excused'
  if (k === 'k') return 'absent'
  return null
}

/** Buổi của 1 em đúng 1 ngày: không có / đúng 1 / nhiều (trùng ngày — không cho sửa ở bảng). */
export function sessionOnDate<S extends Pick<Session, 'date'>>(sessions: S[], date: string): { kind: 'none' } | { kind: 'one'; session: S } | { kind: 'dup'; count: number } {
  const same = sessions.filter((s) => s.date === date)
  if (!same.length) return { kind: 'none' }
  if (same.length > 1) return { kind: 'dup', count: same.length }
  return { kind: 'one', session: same[0] }
}

/** "Số câu" của 1 tiêu chí trong 1 ngày, qua các buổi của cả lớp: giống nhau → số đó; khác nhau →
 *  `mixed` (đổi ở bảng sẽ đặt cùng 1 số cho mọi em, phải hỏi lại). Không em nào đặt → mặc định phiếu. */
export function dayMaxOf(comp: Pick<RubricComponent, 'key' | 'max'>, sessions: Array<Pick<Session, 'maxes'>>): { value: number; mixed: boolean; custom: boolean } {
  const vals = [...new Set(sessions.map((s) => s.maxes?.[comp.key] ?? comp.max))]
  if (!vals.length) return { value: comp.max, mixed: false, custom: false }
  return { value: vals[0], mixed: vals.length > 1, custom: vals.length > 1 || vals[0] !== comp.max }
}

/** Khung "Chi tiết" của 1 dòng: ghi chú chữ của tiêu chí (dạng bài còn sai, từ phát âm sai… —
 *  `evidence` kiểu list/words/text), y hệt ô trong EvidenceFields. Em nghỉ → khóa. */
export function applyEvidenceText(session: Session, comp: string, ev: string, text: string): { ok: true; changed: boolean } | { ok: false; reason: string } {
  if (isLocked(session.entry)) return { ok: false, reason: 'Em nghỉ buổi này — không chấm tiêu chí.' }
  const e = session.entry
  ensure(e)
  const cur = (e.ev[comp]?.[ev] as string | undefined) ?? ''
  if (cur === text) return { ok: true, changed: false }
  e.ev[comp] = { ...(e.ev[comp] ?? {}), [ev]: text } as SessionEntry['ev'][string]
  session.dirty = true
  return { ok: true, changed: true }
}

/** Khung "Chi tiết": bật/tắt 1 nhận định của tiêu chí điểm số (lỗi cần nhắc / điểm tốt), y hệt
 *  chip ở CompEditor. Chỉ nhận nhận định có trong phiếu. */
export function toggleTag(r: Pick<RubricDef, 'comps'>, session: Session, comp: string, tagId: string): { ok: true; changed: boolean } | { ok: false; reason: string } {
  if (isLocked(session.entry)) return { ok: false, reason: 'Em nghỉ buổi này — không chấm tiêu chí.' }
  const c = r.comps.find((x) => x.key === comp)
  if (!c?.tags?.some((t) => t.id === tagId)) return { ok: false, reason: 'Nhận định không có trong phiếu.' }
  const e = session.entry
  ensure(e)
  const a = (e.tags[comp] ?? []) as string[]
  e.tags[comp] = a.includes(tagId) ? a.filter((y) => y !== tagId) : [...a, tagId]
  session.dirty = true
  return { ok: true, changed: true }
}

/** Cách xem bảng (CHỈ đổi cách hiện, không đổi điểm) — lưu trên máy theo từng lớp (đợt 1 không
 *  thêm dữ liệu server). `hidden` = id cột hoặc key tiêu chí; `order` = thứ tự tiêu chí. */
export interface SheetPrefs { hidden: string[]; order: string[]; color: 'level' | 'one'; compact: boolean; progress: boolean }
export const DEFAULT_PREFS: SheetPrefs = { hidden: [], order: [], color: 'level', compact: false, progress: true }

export function readPrefs(raw: string | null): SheetPrefs {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<SheetPrefs>) : {}
    return {
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === 'string') : [],
      order: Array.isArray(p.order) ? p.order.filter((x) => typeof x === 'string') : [],
      color: p.color === 'one' ? 'one' : 'level',
      compact: p.compact === true,
      progress: p.progress !== false,
    }
  } catch { return { ...DEFAULT_PREFS } }
}

/** Tiêu chí theo thứ tự đã chọn (tiêu chí mới thêm vào phiếu nằm theo thứ tự phiếu, sau các tiêu chí
 *  đã xếp); điểm danh luôn đầu, nhận xét luôn cuối; cột ẩn bị bỏ. Tiêu chí không còn cột nào thì bỏ. */
export function arrangeGroups(groups: SheetGroup[], prefs: Pick<SheetPrefs, 'hidden' | 'order'>): SheetGroup[] {
  const hidden = new Set(prefs.hidden)
  const middle = groups.filter((g) => g.key !== 'att' && g.key !== 'note')
  const rank = (k: string) => { const i = prefs.order.indexOf(k); return i < 0 ? prefs.order.length + middle.findIndex((g) => g.key === k) : i }
  const sorted = [...middle].sort((a, b) => rank(a.key) - rank(b.key))
  return [groups[0], ...sorted, groups[groups.length - 1]]
    .filter((g) => g.key === 'att' || !hidden.has(g.key))
    .map((g) => ({ ...g, cols: g.cols.filter((c) => c.id === 'att' || !hidden.has(c.id)) }))
    .filter((g) => g.cols.length > 0)
}

/** Cột đang ẩn mà buổi trong ngày CÓ dữ liệu — báo để không tưởng là trống (cột ẩn vẫn được tính). */
export function hiddenWithData(r: Pick<RubricDef, 'comps'>, groups: SheetGroup[], prefs: Pick<SheetPrefs, 'hidden'>, sessions: Array<Pick<Session, 'entry' | 'maxes'>>): string[] {
  const hidden = new Set(prefs.hidden)
  const out: string[] = []
  for (const g of groups) for (const c of g.cols) {
    if (c.id === 'att' || (!hidden.has(c.id) && !hidden.has(g.key))) continue
    if (sessions.some((s) => { const v = cellView(r, s, c); return v.paint !== 'empty' })) out.push(c.full)
  }
  return out
}
