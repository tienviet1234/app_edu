// Sửa tiêu chí chấm của 1 lớp NGAY TRÊN Bảng chấm điểm (đợt 2b, 23/11). Ghi Y HỆT cấu trúc màn Admin › Tiêu chí
// chấm (compOverrides / compLabelOverrides / compExtraItems / extraComps / hiddenComps) — sửa ở đâu cũng là 1 phiếu.
// Không đổi KIỂU tiêu chí đã có (06/10 đổi Thái độ kiểu này làm 185 buổi bị tính 0 điểm): muốn đổi kiểu thì ẩn
// tiêu chí cũ, thêm tiêu chí mới. Phiếu có phiên bản: lưu chỉ áp từ ngày SAU buổi chấm cuối (server quyết,
// planRubricVersion) — buổi đã chấm không bị tính lại.
import type { ClassData, ExtraComp, RubricComponent } from '@/types'
import { applyCompExtraItems, applyCompLabelOverride, applyCompOverride, extraToComp, getClassRubric, getRubric } from '@/constants/rubrics'
import { sessionTotal } from './scoring'
import { uid } from '@/utils/uid'

type ExtraItem = { id: string; label: string; value: number }
export interface RubricDraft {
  hiddenComps: string[]
  extraComps: ExtraComp[]
  compOverrides: Record<string, Record<string, number>>
  compLabelOverrides: Record<string, Record<string, string>>
  compExtraItems: Record<string, ExtraItem[]>
}
export const DRAFT_FIELDS = ['hiddenComps', 'extraComps', 'compOverrides', 'compLabelOverrides', 'compExtraItems'] as const
type RubricClass = Pick<ClassData, 'name' | 'level' | 'rubricVersions' | (typeof DRAFT_FIELDS)[number]>

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x ?? null)) as T

export function draftOf(cls: RubricClass): RubricDraft {
  return {
    hiddenComps: clone(cls.hiddenComps ?? []),
    extraComps: clone(cls.extraComps ?? []),
    compOverrides: clone(cls.compOverrides ?? {}),
    compLabelOverrides: clone(cls.compLabelOverrides ?? {}),
    compExtraItems: clone(cls.compExtraItems ?? {}),
  }
}

/** 1 mức / phần / việc của 1 tiêu chí (tiêu chí "Điểm số" có đúng 1 mục giả `_max` = điểm tối đa). */
export interface DraftItem { id: string; label: string; pts: number; added: boolean }
export interface DraftComp {
  key: string
  label: string
  type: RubricComponent['type']
  max: number
  hidden: boolean
  /** Tiêu chí do lớp tự thêm (extraComps) — khác tiêu chí gốc của phiếu. */
  custom: boolean
  items: DraftItem[]
}

function itemsOf(c: RubricComponent, addedIds: Set<string>): DraftItem[] {
  if (c.type === 'score') return [{ id: '_max', label: 'Điểm tối đa', pts: c.max, added: false }]
  if (c.type === 'choice') return (c.options ?? []).map((o) => ({ id: o.id, label: o.label, pts: o.pts, added: addedIds.has(o.id) }))
  if (c.type === 'parts') return (c.parts ?? []).map((p) => ({ id: p.id, label: p.label, pts: p.max, added: addedIds.has(p.id) }))
  return (c.items ?? []).map((t) => ({ id: t.id, label: t.label, pts: t.pts, added: addedIds.has(t.id) }))
}

/** Mọi tiêu chí của phiếu nháp (kể cả đang ẩn) theo đúng thứ tự phiếu: gốc trước, tự thêm sau. */
export function draftView(cls: RubricClass, d: RubricDraft): DraftComp[] {
  const hidden = new Set(d.hiddenComps)
  const base = getRubric(cls.level).comps.map((c) => {
    const extra = d.compExtraItems[c.key]
    const eff = applyCompLabelOverride(applyCompOverride(applyCompExtraItems(c, extra), d.compOverrides[c.key]), d.compLabelOverrides[c.key])
    return { key: c.key, label: eff.label, type: c.type, max: eff.max, hidden: hidden.has(c.key), custom: false, items: itemsOf(eff, new Set((extra ?? []).map((x) => x.id))) }
  })
  const extras = d.extraComps.map((ec) => {
    const eff = extraToComp(ec)
    return { key: ec.key, label: eff.label, type: eff.type, max: eff.max, hidden: hidden.has(ec.key), custom: true, items: itemsOf(eff, new Set()) }
  })
  return [...base, ...extras]
}

const baseComp = (cls: RubricClass, key: string) => getRubric(cls.level).comps.find((c) => c.key === key)
function baseItemLabel(c: RubricComponent, id: string): string | undefined {
  return [...(c.options ?? []), ...(c.items ?? [])].find((x) => x.id === id)?.label ?? (c.parts ?? []).find((p) => p.id === id)?.label
}
function baseItemPts(c: RubricComponent, id: string): number | undefined {
  if (id === '_max') return c.max
  return [...(c.options ?? []), ...(c.items ?? [])].find((x) => x.id === id)?.pts ?? (c.parts ?? []).find((p) => p.id === id)?.max
}
const cleanup = <T,>(m: Record<string, Record<string, T>>, key: string) => { if (m[key] && !Object.keys(m[key]).length) delete m[key] }

/** Đổi tên tiêu chí (`itemId` null) hoặc tên 1 mức/phần. Tên trùng tên gốc → bỏ ghi đè (không lưu thừa). */
export function setLabel(cls: RubricClass, d0: RubricDraft, compKey: string, itemId: string | null, label: string): RubricDraft {
  const d = clone(d0)
  const ec = d.extraComps.find((x) => x.key === compKey)
  if (ec) {
    if (itemId === null) ec.label = label
    else {
      const o = ec.options?.find((x) => x.id === itemId) ?? ec.parts?.find((x) => x.id === itemId)
      if (o) o.label = label
    }
    return d
  }
  const added = d.compExtraItems[compKey]?.find((x) => x.id === itemId)
  if (added) { added.label = label; return d }
  const b = baseComp(cls, compKey)
  if (!b) return d
  const id = itemId ?? '_label'
  const original = itemId === null ? b.label : baseItemLabel(b, itemId)
  d.compLabelOverrides[compKey] = { ...(d.compLabelOverrides[compKey] ?? {}) }
  if (label === original) delete d.compLabelOverrides[compKey][id]
  else d.compLabelOverrides[compKey][id] = label
  cleanup(d.compLabelOverrides, compKey)
  return d
}

/** Đổi điểm 1 mức/phần (tiêu chí "Điểm số": `_max`). Bằng điểm gốc → bỏ ghi đè. */
export function setPoints(cls: RubricClass, d0: RubricDraft, compKey: string, itemId: string, pts: number): RubricDraft {
  const d = clone(d0)
  const ec = d.extraComps.find((x) => x.key === compKey)
  if (ec) {
    if (itemId === '_max') ec.max = pts
    const o = ec.options?.find((x) => x.id === itemId)
    if (o) o.pts = pts
    const p = ec.parts?.find((x) => x.id === itemId)
    if (p) p.max = pts
    return d
  }
  const added = d.compExtraItems[compKey]?.find((x) => x.id === itemId)
  if (added) { added.value = pts; return d }
  const b = baseComp(cls, compKey)
  if (!b) return d
  d.compOverrides[compKey] = { ...(d.compOverrides[compKey] ?? {}) }
  if (pts === baseItemPts(b, itemId)) delete d.compOverrides[compKey][itemId]
  else d.compOverrides[compKey][itemId] = pts
  cleanup(d.compOverrides, compKey)
  return d
}

export function toggleHidden(d0: RubricDraft, compKey: string): RubricDraft {
  const d = clone(d0)
  d.hiddenComps = d.hiddenComps.includes(compKey) ? d.hiddenComps.filter((k) => k !== compKey) : [...d.hiddenComps, compKey]
  return d
}

/** Thêm 1 mức/phần/việc vào tiêu chí đã có (giữ nguyên các mức cũ + dữ liệu đã chấm). Tiêu chí "Điểm số" không có mục để thêm. */
export function addItem(cls: RubricClass, d0: RubricDraft, compKey: string, label: string, pts: number): RubricDraft {
  const d = clone(d0)
  const ec = d.extraComps.find((x) => x.key === compKey)
  if (ec) {
    if (ec.type === 'choice') ec.options = [...(ec.options ?? []), { id: `opt_${uid()}`, label, pts }]
    else if (ec.type === 'parts') ec.parts = [...(ec.parts ?? []), { id: `part_${uid()}`, label, max: pts }]
    return d
  }
  const b = baseComp(cls, compKey)
  if (!b || b.type === 'score') return d
  d.compExtraItems[compKey] = [...(d.compExtraItems[compKey] ?? []), { id: `extra_${uid()}`, label, value: pts }]
  return d
}

/** Thêm tiêu chí mới cho lớp (cùng dạng màn Admin tạo: key `custom_…`). */
export function addComp(d0: RubricDraft, type: 'score' | 'choice' | 'parts', label: string, max: number): RubricDraft {
  const d = clone(d0)
  const key = `custom_${uid()}`
  if (type === 'score') d.extraComps.push({ key, label, max, type: 'score' })
  else if (type === 'choice') d.extraComps.push({ key, label, max, type: 'choice', options: [{ id: 'opt_0', label: 'Đạt', pts: max }, { id: 'opt_1', label: 'Một phần', pts: Math.round(max / 2) }, { id: 'opt_2', label: 'Chưa đạt', pts: 0 }] })
  else d.extraComps.push({ key, label, max, type: 'parts', parts: [{ id: 'part_0', label: 'Phần 1', max }] })
  return d
}

/** Lỗi khiến không lưu được (tên trống, điểm âm / không phải số / quá lớn, tiêu chí tối đa 0 điểm). */
export function draftProblems(cls: RubricClass, d: RubricDraft): string[] {
  const out: string[] = []
  for (const c of draftView(cls, d)) {
    if (!c.label.trim()) out.push('Có tiêu chí chưa có tên.')
    if (c.label.length > 120) out.push(`Tên "${c.label.slice(0, 30)}…" quá dài (tối đa 120 ký tự).`)
    for (const it of c.items) {
      if (!it.label.trim()) out.push(`"${c.label}": có mức chưa có tên.`)
      if (!Number.isFinite(it.pts) || it.pts < 0 || it.pts > 1000) out.push(`"${c.label}" · "${it.label}": điểm phải là số từ 0 đến 1000.`)
    }
    if (!c.hidden && c.max <= 0) out.push(`"${c.label}": điểm tối đa phải lớn hơn 0.`)
  }
  return [...new Set(out)]
}

/** Từng thay đổi so với phiếu ĐANG dùng — câu ngắn để xem trước khi lưu. */
export function draftChanges(cls: RubricClass, d: RubricDraft): string[] {
  const before = new Map(draftView(cls, draftOf(cls)).map((c) => [c.key, c]))
  const out: string[] = []
  for (const c of draftView(cls, d)) {
    const b = before.get(c.key)
    if (!b) {
      if (!c.hidden) out.push(`Thêm tiêu chí "${c.label}" (tối đa ${c.max}).`)
      continue
    }
    if (b.hidden !== c.hidden) { out.push(c.hidden ? `Ẩn "${b.label}" — buổi từ ngày áp dụng không chấm mục này.` : `Hiện lại "${c.label}".`); if (c.hidden) continue }
    if (b.label !== c.label) out.push(`Đổi tên "${b.label}" → "${c.label}".`)
    const bi = new Map(b.items.map((x) => [x.id, x]))
    for (const it of c.items) {
      const o = bi.get(it.id)
      if (!o) { out.push(`"${c.label}": thêm mục "${it.label}" ${it.pts}đ.`); continue }
      if (o.label !== it.label) out.push(`"${c.label}": đổi tên mục "${o.label}" → "${it.label}".`)
      if (o.pts !== it.pts) out.push(`"${c.label}"${it.id === '_max' ? '' : ` · "${it.label}"`}: ${o.pts} → ${it.pts} điểm.`)
    }
    if (b.max !== c.max && !c.hidden) out.push(`→ "${c.label}" tối đa ${b.max} → ${c.max}.`)
  }
  return out
}

const canon = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x))
const emptyish = (v: unknown) => v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Object.keys(v as object).length)

/** Chỉ các trường thật sự đổi — gửi lên `PATCH /classes/:id` (rỗng = không có gì để lưu). */
export function draftPatch(cls: RubricClass, d: RubricDraft): Partial<RubricDraft> {
  const out: Partial<RubricDraft> = {}
  for (const f of DRAFT_FIELDS) {
    const a = cls[f]
    const b = d[f]
    if (emptyish(a) && emptyish(b)) continue
    if (canon(a) !== canon(b)) (out as Record<string, unknown>)[f] = b
  }
  return out
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/** Ngày SỚM NHẤT phiếu mới được áp dụng — cùng quy tắc server (`planRubricVersion`): muộn nhất của hôm nay, ngày
 *  sau buổi CHẤM cuối của lớp, ngày bắt đầu của phiên bản gần nhất. Tính trên dữ liệu máy (server vẫn là người
 *  quyết: máy thiếu buổi thì server trả ngày đúng). */
export function earliestEffectiveDate(cls: RubricClass & Pick<ClassData, 'students'>, today: string): string {
  const r = getClassRubric(cls as ClassData)
  let last = ''
  for (const st of cls.students) for (const s of st.sessions) if (s.date > last && sessionTotal(r, s) !== null) last = s.date
  const latest = (cls.rubricVersions ?? []).map((v) => v.until).sort().at(-1) ?? ''
  return [today, last ? addDays(last, 1) : '', latest].sort().at(-1)!
}
