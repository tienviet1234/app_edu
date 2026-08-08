import type { ClassData, StudentStats, EvidenceItem } from '@/types'
import { RANKS } from '@/constants'
import { getRubric } from '@/constants/rubrics'
import { attInfo, compScore, compErrors, sessionScore } from './scoring'

const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

export const rankOf = (avg: number) => RANKS.find((x) => avg >= x.min) ?? RANKS[RANKS.length - 1]

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

export function statsOf(cls: ClassData, sid: string, from = 0, to: number | null = null): StudentStats {
  const r = getRubric(cls.level)
  const list = cls.sessions.slice(from, to === null ? cls.sessions.length : to)
  const totals: number[] = []
  const cat: Record<string, number[]> = {}
  r.comps.forEach((c) => (cat[c.key] = []))
  const partSum: Record<string, number> = {}
  const partN: Record<string, number> = {}
  const evRaw: Record<string, string[]> = {}
  const ratio: Record<string, { ok: number; total: number }> = {}
  const errCount: Record<string, number> = {}
  const errMeta: Record<string, { id: string; label: string; weak?: string; fix?: string; comp: string }> = {}
  let present = 0, late = 0, excused = 0, absent = 0, exp = 0, streak = 0, best = 0, perfect = 0

  list.forEach((s) => {
    const e = s.entries[sid]
    if (!e) return
    const a = e.attendance
    if (a === 'present') present++
    else if (a === 'late') late++
    else if (a === 'excused') excused++
    else absent++
    if (a === 'present' || a === 'late') { streak++; best = Math.max(best, streak) }
    else if (a === 'absent') streak = 0

    const t = sessionScore(e, r)
    if (t === null) return
    totals.push(t)
    exp += t + 5 + (t >= 90 ? 10 : 0)
    r.comps.forEach((c, ci) => {
      cat[c.key].push(compScore(c, e))
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
    if (r.comps[0] && compScore(r.comps[0], e) >= r.comps[0].max) perfect++
  })

  const catAvg: Record<string, number> = {}
  Object.keys(cat).forEach((k) => (catAvg[k] = mean(cat[k])))
  const partAvg: Record<string, number> = {}
  Object.keys(partSum).forEach((k) => (partAvg[k] = partSum[k] / partN[k]))
  const evidence: Record<string, EvidenceItem[]> = {}
  Object.keys(evRaw).forEach((k) => (evidence[k] = mergeEvidence(evRaw[k])))

  const attendScore =
    r.attendance.mode === 'deduct'
      ? Math.max(0, (r.attendance.base ?? 10) - late * 2 - excused * 3 - absent * 5)
      : mean(
          list
            .map((s) => s.entries[sid])
            .filter(Boolean)
            .map((e) => attInfo(e.attendance).pts),
        )

  const monthTotal = r.comps.reduce((a, c) => a + catAvg[c.key], 0) + attendScore
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
    hwRate: hwComp ? (catAvg.hw / hwComp.max) * 100 : 0,
    stars: atComp ? Math.max(0, Math.min(5, Math.round((catAvg.attitude / atComp.max) * 5))) : 0,
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
