import type { Student, StudentStats, DetailBlock, EvidenceItem, SessionEntry, Session } from '@/types'
import { getRubric } from '@/constants/rubrics'
import { round1 } from '@/utils'
import { compHasData, sessionComps } from './scoring'

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

const ATTENDANCE_NOTE: Record<string, string> = {
  absent: 'Nghỉ không phép',
  excused: 'Nghỉ có phép',
  late: 'Đi muộn',
}

/** Tình hình CỦA ĐÚNG 1 BUỔI — ghép điểm danh + ghi chú tự do + mọi ghi chú
 *  cụ thể (phát âm sai, dạng bài sai...) giáo viên đã điền NGAY BUỔI ĐÓ. Đây
 *  là nguyên văn những gì giáo viên gõ, không tự diễn giải thêm. */
function sessionStatusText(entry: SessionEntry): string {
  const parts: string[] = []
  if (ATTENDANCE_NOTE[entry.attendance]) parts.push(ATTENDANCE_NOTE[entry.attendance])
  if (entry.note?.trim()) parts.push(entry.note.trim())
  Object.values(entry.ev ?? {}).forEach((compEv) => {
    Object.values(compEv ?? {}).forEach((v) => {
      if (typeof v === 'string' && v.trim()) parts.push(v.trim())
    })
  })
  return parts.join('; ')
}

export interface SessionDetailRow {
  no: number
  date: string
  homework: string
  status: string
  /** true nếu `status` do hệ thống TỰ SINH từ điểm số đã chấm (buổi đó giáo
   *  viên không ghi chú/ghi chú cụ thể gì) — false nếu là nguyên văn giáo
   *  viên tự gõ. Không bao giờ ghi đè lên ghi chú thật, chỉ điền khi trống. */
  isAuto: boolean
}

/** Tự ghép 1 câu NGẮN tả tình hình buổi học, CHỈ dựa trên điểm số đã chấm
 *  thật (Bài tập về nhà/Video bài nói/các tiêu chí "chọn 1 mức" hay "tích
 *  việc đã làm" khác) — KHÔNG bịa thêm chi tiết nào giáo viên chưa từng ghi
 *  (VD không tự đoán từ phát âm sai cụ thể, chỉ nói đúng tên tiêu chí bị
 *  trừ điểm). Dùng làm fallback khi buổi đó không có ghi chú tự do/evidence
 *  nào (xem sessionDetailsOf) — không áp dụng cho tiêu chí dạng 'score'
 *  (mini test/nghe) vì không có nhãn "đạt/chưa đạt" tự nhiên để ghép câu.
 *
 *  Giọng văn PHẢI khớp cách giáo viên trung tâm vẫn tự viết tay (xem ảnh mẫu
 *  thật trong trao đổi): viết HOA từ khóa trạng thái "ĐÃ LÀM"/"CHƯA LÀM",
 *  câu ngắn, không phải văn viết đầy đủ chủ-vị kiểu báo cáo. */
function autoSessionStatus(session: Session, r: ReturnType<typeof getRubric>): string {
  const e = session.entry
  const parts: string[] = []
  sessionComps(r, session).forEach((c) => {
    if (!compHasData(c, e)) return
    const label = c.label.toUpperCase()
    if (c.type === 'choice') {
      const opt = c.options?.find((o) => o.id === e.choice[c.key])
      if (!opt) return
      if (opt.pts >= c.max) parts.push(`ĐÃ LÀM ${label}.`)
      else if (opt.pts <= 0) parts.push(`CHƯA LÀM ${label}.`)
      else parts.push(`${label} CHƯA ĐẦY ĐỦ${opt.err?.fix ? ` — cần ${opt.err.fix}` : ''}.`)
    } else if (c.type === 'parts') {
      if (e.skip[c.key]) {
        parts.push(`CHƯA LÀM ${label}.`)
        return
      }
      const m = e.parts[c.key] ?? {}
      const ok = (c.parts ?? []).filter((p) => (Number(m[p.id]) || 0) >= p.max)
      const weak = (c.parts ?? []).filter((p) => (Number(m[p.id]) || 0) < p.max)
      if (!weak.length) parts.push(`ĐÃ LÀM ${label} ĐẦY ĐỦ.`)
      else if (!ok.length) parts.push(`CHƯA LÀM ${label}.`)
      else parts.push(`ĐÃ LÀM ${label}: cần ${weak.map((p) => p.fix ?? p.label.toLowerCase()).join(', ')}.`)
    } else if (c.type === 'ticks') {
      const checked = e.ticks[c.key] ?? []
      const items = c.items ?? []
      const missing = items.filter((it) => !checked.includes(it.id))
      // Tiêu chí kiểu "thái độ/tinh thần" (c.stars, VD Thái độ học tập) —
      // không ai "LÀM" thái độ cả, chỉ "CÓ"/"thể hiện" được. Khuôn "ĐÃ LÀM X"
      // nghe sai ngữ pháp, giống máy sinh — liệt kê thẳng các biểu hiện thay
      // vì ép vào khuôn chung với Bài tập về nhà/Video.
      if (c.stars) {
        if (checked.length && !missing.length) {
          const got = checked.map((id) => items.find((it) => it.id === id)?.label.toLowerCase()).filter(Boolean)
          parts.push(`${got.join(', ')}.`)
        } else if (missing.length) {
          parts.push(`Cần cải thiện: ${missing.map((it) => it.label.toLowerCase()).join(', ')}.`)
        }
        return
      }
      if (!missing.length) parts.push(`ĐÃ LÀM ${label} ĐẦY ĐỦ.`)
      else if (!checked.length) parts.push(`CHƯA LÀM ${label}.`)
      else parts.push(`ĐÃ LÀM ${label}: còn thiếu ${missing.map((it) => it.label.toLowerCase()).join(', ')}.`)
    }
  })
  return parts.join(' ')
}

/** Chi tiết TỪNG BUỔI trong kỳ [from, to) — đúng mức chi tiết trung tâm vẫn
 *  tự ghi tay (bài tập giao buổi nào, buổi đó làm được gì/chưa làm gì) thay
 *  vì chỉ 1 câu nhận xét tổng hợp chung chung. "no" ở đây đánh số LẠI theo
 *  đúng kỳ (buổi 1, 2, 3... của kỳ này), không phải số buổi toàn khóa học.
 *  `r` (rubric) tùy chọn — truyền vào để TỰ SINH nhận xét cho buổi nào giáo
 *  viên không ghi chú gì (xem autoSessionStatus); bỏ trống thì giữ hành vi
 *  cũ (để trống nếu giáo viên chưa ghi, không tự sinh gì). */
export function sessionDetailsOf(
  student: Pick<Student, 'sessions'>, from: number, to: number, r?: ReturnType<typeof getRubric>,
): SessionDetailRow[] {
  return student.sessions.slice(from, to).map((s, i) => {
    const status = sessionStatusText(s.entry)
    // Buổi có mặt nhưng CHƯA CHẤM ĐIỂM gì cả (chỉ điểm danh) thì
    // autoSessionStatus() cũng không có số liệu nào để dựa vào — vẫn phải
    // ghi rõ tình trạng thay vì để trống (không fabricate điểm/nhận xét,
    // chỉ nói đúng sự thật: có đi học, chưa có dữ liệu chấm).
    let auto = ''
    if (!status && r) {
      auto = autoSessionStatus(s, r)
      // Vẫn không có gì (chưa chấm điểm mục nào) — "Bài giao" đã hiện riêng
      // 1 dòng khác ở UI (xem TuitionReportScreen), không lặp lại ở đây —
      // chỉ cần xác nhận có đi học. Đây là tình huống BÌNH THƯỜNG (không có
      // gì đáng chú ý) nên viết thường, không hoa toàn bộ như các câu có
      // trạng thái cụ thể (ĐÃ LÀM/CHƯA LÀM) — viết hoa hết 1 câu không có gì
      // đặc biệt sẽ nghe cứng nhắc, giống máy sinh. Đổi luân phiên theo buổi
      // để 2 buổi liền kề không lặp y hệt 1 câu (vẫn đúng sự thật, chỉ khác
      // cách diễn đạt).
      if (!auto && s.entry.attendance === 'present') {
        const variants = ['Đi học đầy đủ, đúng giờ.', 'Buổi học diễn ra bình thường, đi học đúng giờ.', 'Đi học bình thường, không có gì đặc biệt.']
        auto = variants[i % variants.length]
      }
    }
    return {
      no: i + 1,
      date: s.date,
      homework: s.homework?.trim() ?? '',
      status: status || auto,
      isAuto: !status && !!auto,
    }
  })
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
  const evLine = topEvidenceLine(s, r)

  // Dẫn bằng 1 CHI TIẾT CỤ THỂ (ghi chú thật giáo viên đã gõ lúc chấm) nếu
  // có, thay vì câu đánh giá % chung chung — đọc tự nhiên hơn, tránh kiểu
  // công thức "khen → chê → dặn" lặp lại y hệt mỗi lần (dễ bị nhận ra là
  // sinh tự động). Chỉ rơi về câu % khi không có ghi chú cụ thể nào.
  if (evLine) {
    L.push(evLine)
  } else {
    L.push(
      pct >= 90
        ? `${name} làm bài chắc, gần như không sai gì đáng kể trong kỳ này.`
        : pct >= 75
          ? `${name} học ổn, vẫn còn vài chỗ chưa chắc.`
          : `${name} cần ôn lại nhiều, chưa theo kịp tiến độ lớp.`,
    )
  }

  const top = s.errors.slice(0, 2)
  if (top.length) {
    const weakText = top.map((t) => `${t.weak} (${t.count} lần)`).join(', ')
    const fix = top[0].fix
    L.push(fix ? `Hay sai nhất ở ${weakText} — ${fix}.` : `Hay sai nhất ở ${weakText}.`)
  }

  if (s.absent > 0)
    L.push(`Nghỉ không phép ${s.absent} buổi, nhờ phụ huynh nhắc con đi học đều hơn.`)

  return L.join(' ')
}
