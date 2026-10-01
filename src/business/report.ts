import type { Student, StudentStats, DetailBlock, EvidenceItem } from '@/types'
import { getRubric } from '@/constants/rubrics'
import { round1 } from '@/utils'

/** Kỳ báo cáo — theo buổi RIÊNG của đúng 1 học sinh (mỗi em tiến độ khác nhau). */
export function periodsOf(student: Student, perMonth: number) {
  const n = student.sessions.length
  const p: Array<{ from: number; to: number; label: string }> = []
  if (perMonth === 8) {
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
      // partAvg là % (0–100) — buổi nào chưa có dữ liệu phần này thì coi như
      // "đạt" (mặc định 100%), giữ đúng hành vi cũ (mặc định p.max = đạt).
      const pctOf = (p: { id: string }) => s.partAvg[`${c.key}.${p.id}`] ?? 100
      const weak = (c.parts ?? []).filter((p) => pctOf(p) < 95)
      const ok = (c.parts ?? []).filter((p) => pctOf(p) >= 95)
      if (ok.length && c.key !== 'attitude')
        lines.push(`${ok.map((p) => p.label.toLowerCase()).join(', ')}: đạt.`)
      // "bao nhiêu trên bao nhiêu" — điểm đạt/tối đa THẬT (cộng đúng theo mức
      // của từng buổi); buổi chưa có dữ liệu phần này thì partPts.max = 0,
      // không có gì để chia nên hiện điểm tối đa mặc định là "đạt".
      weak.forEach((p) => {
        const pts = s.partPts[`${c.key}.${p.id}`]
        const text = pts && pts.max > 0 ? `${round1(pts.earned)}/${round1(pts.max)}` : `0/${p.max}`
        lines.push(`${p.label}: ${text} — cần ${p.fix}.`)
      })
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

/** Tìm mục ghi chú cụ thể (VD "Từ phát âm chưa đúng: make, snowflake...")
 *  ĐÁNG NÊU NHẤT — nhiều lần được ghi nhận nhất trong kỳ — để đưa vào nhận
 *  xét tự động 1 chi tiết CỤ THỂ (không phải chỉ điểm số/% chung chung),
 *  giống cách giáo viên vẫn tự viết tay (VD "chú ý phát âm: ..."). Vẫn hoàn
 *  toàn dựa trên dữ liệu giáo viên đã ghi khi chấm điểm (s.evidence), không
 *  tự bịa ra — chỉ có nội dung nếu giáo viên có điền ghi chú cụ thể lúc chấm. */
function topEvidenceLine(s: StudentStats, r: ReturnType<typeof getRubric>): string | undefined {
  let bestLabel = ''
  let bestItems: EvidenceItem[] = []
  let bestTotal = 0
  r.comps.forEach((c) => {
    ;(c.evidence ?? []).filter((ev) => ev.type !== 'ratio').forEach((ev) => {
      const items = s.evidence[`${c.key}.${ev.key}`] ?? []
      const total = items.reduce((a, it) => a + it.n, 0)
      if (total > bestTotal) { bestTotal = total; bestLabel = ev.label; bestItems = items }
    })
  })
  if (!bestItems.length) return undefined
  return `${bestLabel}: ${bestItems.slice(0, 4).map((it) => it.text).join(', ')}.`
}

export function buildComment(name: string, s: StudentStats, r: ReturnType<typeof getRubric>): string {
  const L: string[] = []
  // So theo % (monthTotal/monthMax) chứ không so số tuyệt đối với 90/75 —
  // lớp có tùy chỉnh thêm/bớt tiêu chí thì monthMax không phải lúc nào cũng
  // là 100, so trực tiếp số tuyệt đối sẽ nhận xét sai cho những lớp đó.
  const pct = s.monthMax > 0 ? (s.monthTotal / s.monthMax) * 100 : 0
  L.push(
    pct >= 90
      ? `${name} có kết quả học tập tốt và duy trì đều đặn.`
      : pct >= 75
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
  const evLine = topEvidenceLine(s, r)
  if (evLine) L.push(evLine)
  if (s.absent > 0)
    L.push(`Con nghỉ không phép ${s.absent} buổi, phụ huynh nhắc con đi học đều hơn giúp cô.`)
  return L.join(' ')
}
