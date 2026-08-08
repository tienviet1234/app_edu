import type { ClassData, StudentStats, DetailBlock } from '@/types'
import { getRubric } from '@/constants/rubrics'
import { round1 } from '@/utils'

export function periodsOf(cls: ClassData) {
  const n = cls.sessions.length
  const p: Array<{ from: number; to: number; label: string }> = []
  if (cls.perMonth === 8) {
    for (let end = 8; end <= n; end += 8)
      p.push({ from: end - 8, to: end, label: `Báo cáo tháng — buổi ${end - 7}–${end}` })
  } else {
    for (let s = 0; s + 6 <= n; s += 12) {
      p.push({ from: s, to: s + 6, label: `Báo cáo giữa kỳ — buổi ${s + 1}–${s + 6}` })
      if (s + 12 <= n)
        p.push({ from: s, to: s + 12, label: `Báo cáo tổng kết tháng — buổi ${s + 1}–${s + 12}` })
    }
  }
  const last = p[p.length - 1]
  if (!last || last.from !== 0 || last.to !== n)
    p.push({ from: 0, to: n, label: `Báo cáo hiện tại — buổi 1–${n}` })
  return p
}

export function detailBlocks(s: StudentStats, r: ReturnType<typeof getRubric>): DetailBlock[] {
  const out: DetailBlock[] = []
  r.comps.forEach((c) => {
    const lines: string[] = []
    const ratioEv = (c.evidence ?? []).find((x) => x.type === 'ratio')
    if (ratioEv) {
      const v = s.ratio[`${c.key}.${ratioEv.key}`]
      if (v && v.total > 0)
        lines.push(`Đúng ${v.ok}/${v.total} ${ratioEv.unit ?? 'câu'} (${Math.round((v.ok / v.total) * 100)}%).`)
    }
    if (c.type === 'parts') {
      const weak = (c.parts ?? []).filter(
        (p) => (s.partAvg[`${c.key}.${p.id}`] ?? p.max) < p.max * 0.95,
      )
      const ok = (c.parts ?? []).filter(
        (p) => (s.partAvg[`${c.key}.${p.id}`] ?? p.max) >= p.max * 0.95,
      )
      if (ok.length && c.key !== 'attitude')
        lines.push(`${ok.map((p) => p.label.toLowerCase()).join(', ')}: đạt.`)
      weak.forEach((p) =>
        lines.push(
          `${p.label}: ${round1(s.partAvg[`${c.key}.${p.id}`] || 0)}/${p.max} — cần ${p.fix}.`,
        ),
      )
    }
    ;(c.evidence ?? [])
      .filter((x) => x.type !== 'ratio')
      .forEach((ev) => {
        const items = s.evidence[`${c.key}.${ev.key}`] ?? []
        if (items.length)
          lines.push(`${ev.label}: ${items.slice(0, 8).map((x) => x.text).join(', ')}.`)
      })
    if (lines.length) out.push({ icon: (r.icons ?? {})[c.key] ?? '•', title: c.label, lines })
  })

  const att: string[] = []
  if (s.late) att.push(`đi muộn ${s.late} buổi`)
  if (s.excused) att.push(`nghỉ có phép ${s.excused} buổi`)
  if (s.absent) att.push(`nghỉ không phép ${s.absent} buổi`)
  out.push({
    icon: '📅',
    title: 'Chuyên cần',
    lines: att.length ? [`Trong kỳ: ${att.join(', ')}.`] : ['Đi học đầy đủ, đúng giờ.'],
  })
  return out
}

export function buildComment(name: string, s: StudentStats, r: ReturnType<typeof getRubric>): string {
  void r
  const L: string[] = []
  L.push(
    s.monthTotal >= 90
      ? `${name} có kết quả học tập tốt và duy trì đều đặn.`
      : s.monthTotal >= 75
        ? `${name} học khá ổn định, vẫn còn một vài điểm cần chỉnh.`
        : `${name} cần cố gắng thêm để theo kịp tiến độ lớp.`,
  )
  const top = s.errors.slice(0, 2)
  if (top.length === 2)
    L.push(
      `Con chủ yếu mất điểm ở ${top[0].weak} (${top[0].count} lần) và ${top[1].weak} (${top[1].count} lần).`,
    )
  else if (top.length === 1)
    L.push(`Con chủ yếu mất điểm ở ${top[0].weak} (${top[0].count} lần).`)
  const fixes = [...new Set(top.map((t) => t.fix).filter(Boolean))]
  if (fixes.length)
    L.push(`Tháng tới, cô sẽ tập trung ${fixes.join(' và ')} để giúp con cải thiện kết quả.`)
  if (s.absent > 0)
    L.push(`Con nghỉ không phép ${s.absent} buổi, phụ huynh nhắc con đi học đều hơn giúp cô.`)
  return L.join(' ')
}
