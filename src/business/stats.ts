import type { ClassData, Session, StudentStats, EvidenceItem } from '@/types'
import { RANKS } from '@/constants'
import { getClassRubric } from '@/constants/rubrics'
import { attInfo, compScore, compHasData, compErrors, sessionScore, sessionComps } from './scoring'

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

export const rankOf = (avg: number) => RANKS.find((x) => avg >= x.min) ?? RANKS[RANKS.length - 1]

/** Tập hợp các ngày học đã diễn ra trong lớp — hợp (union) ngày của mọi học
 *  sinh, sắp xếp tăng dần. Dùng cho các bảng/biểu đồ tổng hợp cả lớp. */
export function allDatesOf(cls: ClassData): string[] {
  const set = new Set<string>()
  cls.students.forEach((st) => st.sessions.forEach((s) => set.add(s.date)))
  return [...set].sort()
}

/** Số buổi lớp THỰC SỰ đã dạy — đếm theo số ngày khác nhau (không phải cộng
 *  dồn buổi của từng học sinh, vì 5 học sinh cùng học "buổi 1" trong 1 ngày
 *  là 1 buổi dạy, không phải 5). */
export function teachingDaysOf(cls: ClassData): number {
  return allDatesOf(cls).length
}

export function mergeEvidence(values: (string | undefined)[]): EvidenceItem[] {
  const m = new Map<string, EvidenceItem>()
  values.forEach((v) =>
    String(v ?? '')
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((x) => {
        const k = x.toLowerCase()
        m.set(k, { text: m.get(k)?.text ?? x, n: (m.get(k)?.n ?? 0) + 1 })
      }),
  )
  return [...m.values()].sort((a, b) => b.n - a.n)
}

/** sessions: buổi học của ĐÚNG 1 học sinh (student.sessions, hoặc 1 đoạn con của nó
 *  đã được lọc theo ngày/kỳ báo cáo bởi caller — statsOf không tự lọc gì thêm). */
export function statsOf(cls: ClassData, sessions: Session[]): StudentStats {
  const r = getClassRubric(cls)
  const list = sessions
  const totals: number[] = []
  const partSum: Record<string, number> = {}
  const partN: Record<string, number> = {}
  const evRaw: Record<string, string[]> = {}
  const ratio: Record<string, { ok: number; total: number }> = {}
  const errCount: Record<string, number> = {}
  const errMeta: Record<string, { id: string; label: string; weak?: string; fix?: string; comp: string }> = {}
  let present = 0, late = 0, excused = 0, absent = 0, exp = 0, streak = 0, best = 0, perfect = 0

  // Điểm/tối đa CỦA TỪNG TIÊU CHÍ, cộng dồn riêng — không gộp chung thành 1
  // số điểm trung bình như trước, vì mỗi buổi có thể có mức tối đa khác
  // nhau (giáo viên đổi "Số câu" riêng cho buổi đó). catAvg cuối cùng là %
  // (điểm đạt / tối đa CỦA ĐÚNG NHỮNG BUỔI ĐÃ CHẤM mục đó), không phải điểm
  // thô so với 1 mức tối đa cố định — nên không còn lệ thuộc mức tối đa mặc
  // định của rubric, luôn đúng dù buổi đó có bao nhiêu câu.
  const catEarn: Record<string, number> = {}
  const catMax: Record<string, number> = {}
  r.comps.forEach((c) => { catEarn[c.key] = 0; catMax[c.key] = 0 })
  const partEarn: Record<string, number> = {}
  const partMax: Record<string, number> = {}

  list.forEach((s) => {
    const e = s.entry
    const a = e.attendance
    if (a === 'present') present++
    else if (a === 'late') late++
    else if (a === 'excused') excused++
    else absent++
    if (a === 'present' || a === 'late') { streak++; best = Math.max(best, streak) }
    else if (a === 'absent') streak = 0

    // Tiêu chí ĐÚNG của buổi này — áp "Số câu" riêng của buổi (nếu có), thay
    // vì luôn dùng mức mặc định của rubric cho mọi buổi.
    const comps = sessionComps(r, s)
    const t = sessionScore(e, { ...r, comps })
    if (t === null) return
    totals.push(t)
    exp += t + 5 + (t >= 90 ? 10 : 0)
    comps.forEach((c, ci) => {
      if (compHasData(c, e)) {
        catEarn[c.key] += compScore(c, e)
        catMax[c.key] += c.max
      }
      compErrors(c, e).forEach((x) => {
        if (!x) return
        errCount[x.id] = (errCount[x.id] ?? 0) + 1
        errMeta[x.id] = { ...x, comp: c.key }
      })
      if (c.type === 'parts' && !e.skip?.[c.key]) {
        const m = e.parts?.[c.key] ?? {}
        ;(c.parts ?? []).forEach((p) => {
          if (m[p.id] == null || m[p.id] === '') return
          const k = `${c.key}.${p.id}`
          partSum[k] = (partSum[k] ?? 0) + (Number(m[p.id]) || 0)
          partN[k] = (partN[k] ?? 0) + 1
          partEarn[k] = (partEarn[k] ?? 0) + (Number(m[p.id]) || 0)
          partMax[k] = (partMax[k] ?? 0) + p.max
        })
      }
      ;(c.evidence ?? []).forEach((ev) => {
        const v = e.ev?.[c.key]?.[ev.key]
        const k = `${c.key}.${ev.key}`
        if (ev.type === 'ratio') {
          const rv = v as { ok: string | number; total: string | number } | undefined
          if (rv && Number(rv.total) > 0 && rv.ok !== '' && rv.ok != null) {
            ratio[k] = ratio[k] ?? { ok: 0, total: 0 }
            ratio[k].ok += Number(rv.ok) || 0
            ratio[k].total += Number(rv.total) || 0
          }
        } else if (v) {
          ;(evRaw[k] = evRaw[k] ?? []).push(v as string)
        }
      })
      void ci
    })
    if (comps[0] && compHasData(comps[0], e) && compScore(comps[0], e) >= comps[0].max) perfect++
  })

  // catAvg/partAvg giờ là % (0–100), tính dồn (điểm đạt / tối đa) trên đúng
  // những buổi ĐÃ chấm mục đó — không phải trung bình cộng điểm thô, để
  // không còn phụ thuộc 1 mức tối đa cố định khi các buổi có "Số câu" khác
  // nhau. Buổi nào chưa chấm mục đó thì không tính vào (không kéo % xuống oan).
  const catAvg: Record<string, number> = {}
  Object.keys(catEarn).forEach((k) => (catAvg[k] = catMax[k] > 0 ? (catEarn[k] / catMax[k]) * 100 : 0))
  const partAvg: Record<string, number> = {}
  Object.keys(partSum).forEach((k) => (partAvg[k] = partMax[k] > 0 ? (partEarn[k] / partMax[k]) * 100 : 0))
  // Điểm/tối đa THẬT (đã cộng dồn đúng theo mức của từng buổi) — hiển thị
  // dạng "bao nhiêu trên bao nhiêu" cho rõ, thay vì chỉ đưa ra 1 con số %.
  const catPts: Record<string, { earned: number; max: number }> = {}
  Object.keys(catEarn).forEach((k) => (catPts[k] = { earned: catEarn[k], max: catMax[k] }))
  const partPts: Record<string, { earned: number; max: number }> = {}
  Object.keys(partSum).forEach((k) => (partPts[k] = { earned: partEarn[k] ?? 0, max: partMax[k] ?? 0 }))
  const evidence: Record<string, EvidenceItem[]> = {}
  Object.keys(evRaw).forEach((k) => (evidence[k] = mergeEvidence(evRaw[k])))

  const attendScore =
    r.attendance.mode === 'deduct'
      ? Math.max(0, (r.attendance.base ?? 10) - late * 2 - excused * 3 - absent * 5)
      : mean(list.map((s) => attInfo(s.entry.attendance).pts))

  // monthTotal vẫn giữ thang điểm /100 như trước (tổng mức tối đa MẶC ĐỊNH
  // của rubric + chuyên cần) — quy đổi ngược từ % (catAvg) về điểm theo mức
  // mặc định, để không đổi thang điểm hiển thị dù buổi nào đó có override
  // "Số câu" riêng khác mức mặc định.
  const monthTotal = r.comps.reduce((a, c) => a + (catAvg[c.key] / 100) * c.max, 0) + attendScore
  const avg = mean(totals)
  let progress = 0
  if (totals.length >= 4) {
    const h = Math.floor(totals.length / 2)
    progress = mean(totals.slice(-h)) - mean(totals.slice(0, h))
  }

  const errors = Object.entries(errCount)
    .map(([id, n]) => ({ ...errMeta[id], count: n }))
    .sort((a, b) => b.count - a.count)

  const atComp = r.comps.find((c) => c.key === 'attitude')
  const hwComp = r.comps.find((c) => c.key === 'hw')

  return {
    totals,
    avg,
    monthTotal,
    catAvg,
    partAvg,
    catPts,
    partPts,
    evidence,
    ratio,
    errors,
    progress,
    attendScore,
    errorsFor: (comp) => errors.filter((x) => x.comp === comp.key),
    present,
    late,
    excused,
    absent,
    attended: present + late,
    counted: totals.length,
    // catAvg giờ đã LÀ % (0–100) — không còn chia lại cho .max nữa.
    hwRate: hwComp ? catAvg.hw : 0,
    stars: atComp ? Math.max(0, Math.min(5, Math.round((catAvg.attitude / 100) * 5))) : 0,
    perfect,
    exp,
    level: 1 + Math.floor(exp / 150),
    expInLevel: exp % 150,
    toNext: 150 - (exp % 150),
    streak: best,
    currentStreak: streak,
    rank: rankOf(avg),
  }
}
