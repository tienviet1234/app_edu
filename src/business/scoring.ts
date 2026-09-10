import type { RubricComponent, SessionEntry, Tag } from '@/types'
import { TAG_BY_ID, ATTEND } from '@/constants'

export const attInfo = (k: string) => ATTEND.find((a) => a.key === k) ?? ATTEND[0]

/** Phân bổ lại `newMax` cho 1 danh sách phần nhỏ theo đúng tỷ lệ điểm cũ,
 *  làm tròn xuống rồi bù phần dư (largest-remainder) để tổng khớp CHÍNH XÁC
 *  newMax — không lệch 1-2 điểm do làm tròn từng phần riêng lẻ. */
function distribute(values: number[], newMax: number): number[] {
  const oldTotal = values.reduce((a, b) => a + b, 0)
  if (oldTotal <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v * newMax) / oldTotal)
  const floors = raw.map(Math.floor)
  let remainder = newMax - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const result = [...floors]
  for (let k = 0; k < remainder && k < order.length; k++) result[order[k].i] += 1
  return result
}

/** Đổi tổng điểm 1 tiêu chí (ticks/parts) sang `newMax`, tự chia lại điểm
 *  từng phần nhỏ bên trong theo đúng tỷ lệ cũ — dùng khi giáo viên sửa
 *  "Số câu"/tổng ngay tại màn Nhập điểm, không cần sửa tay từng phần. */
export function rescaleComp(comp: RubricComponent, newMax: number): RubricComponent {
  if (comp.type === 'ticks' && comp.items?.length) {
    const pts = distribute(comp.items.map((it) => it.pts), newMax)
    const items = comp.items.map((it, i) => ({ ...it, pts: pts[i] }))
    return { ...comp, items, max: items.reduce((a, it) => a + it.pts, 0) }
  }
  if (comp.type === 'parts' && comp.parts?.length) {
    const maxes = distribute(comp.parts.map((p) => p.max), newMax)
    const parts = comp.parts.map((p, i) => ({ ...p, max: maxes[i] }))
    return { ...comp, parts, max: parts.reduce((a, p) => a + p.max, 0) }
  }
  return { ...comp, max: newMax }
}

export function compScore(comp: RubricComponent, e: SessionEntry): number {
  switch (comp.type) {
    case 'score':
      return Number(e.scores?.[comp.key]) || 0
    case 'ticks':
      return (comp.items ?? [])
        .filter((i) => (e.ticks?.[comp.key] ?? []).includes(i.id))
        .reduce((a, b) => a + b.pts, 0)
    case 'choice': {
      const o = (comp.options ?? []).find((x) => x.id === e.choice?.[comp.key])
      return o ? o.pts : 0
    }
    case 'parts': {
      if (e.skip?.[comp.key]) return 0
      const m = e.parts?.[comp.key] ?? {}
      return (comp.parts ?? []).reduce(
        (a, p) => a + Math.min(p.max, Math.max(0, Number(m[p.id]) || 0)),
        0,
      )
    }
    default:
      return 0
  }
}

export function compHasData(comp: RubricComponent, e: SessionEntry): boolean {
  switch (comp.type) {
    case 'score':
      return e.scores?.[comp.key] !== '' && e.scores?.[comp.key] != null
    case 'ticks':
      return (e.ticks?.[comp.key] ?? []).length > 0
    case 'choice':
      return !!e.choice?.[comp.key]
    case 'parts':
      return !!e.skip?.[comp.key] || Object.keys(e.parts?.[comp.key] ?? {}).length > 0
    default:
      return false
  }
}

export function compErrors(comp: RubricComponent, e: SessionEntry): Tag[] {
  switch (comp.type) {
    case 'score':
      return (e.tags?.[comp.key] ?? [])
        .map((id) => TAG_BY_ID[id])
        .filter((t): t is Tag => !!t && !t.good)
    case 'choice': {
      const o = (comp.options ?? []).find((x) => x.id === e.choice?.[comp.key])
      return o?.err ? [o.err as unknown as Tag] : []
    }
    case 'parts': {
      if (e.skip?.[comp.key]) {
        return comp.zeroErr ? [comp.zeroErr as unknown as Tag] : []
      }
      const m = e.parts?.[comp.key] ?? {}
      return (comp.parts ?? [])
        .filter((p) => p.weak && (Number(m[p.id]) || 0) < p.max)
        .map((p) => ({
          id: `${comp.key}_${p.id}`,
          label: `${p.label} chưa đạt`,
          weak: p.weak,
          fix: p.fix,
        })) as Tag[]
    }
    default:
      return []
  }
}

export function sessionScore(e: SessionEntry | undefined, r: { comps: RubricComponent[]; attendance: { mode: string } }): number | null {
  if (!e) return null
  if (e.attendance === 'excused') return null
  if (e.attendance === 'absent') return 0
  if (!r.comps.some((c) => compHasData(c, e))) return null
  return attInfo(e.attendance).pts + r.comps.reduce((a, c) => a + compScore(c, e), 0)
}
