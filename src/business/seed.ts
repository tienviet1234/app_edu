import type { AppData, ClassData, Student, SessionEntry, AttendanceKey } from '@/types'
import { RUBRICS } from '@/constants'
import { uid } from '@/utils/uid'
import { todayISO } from '@/utils/format'

export function emptyEntry(): SessionEntry {
  return {
    attendance: 'present',
    scores: {},
    tags: {},
    ticks: {},
    choice: {},
    parts: {},
    skip: {},
    ev: {},
    note: '',
  }
}

const SAMPLE: Record<string, string[]> = {
  pronErr: ['brother, think', 'thirteen, three', 'brother'],
  practice: ['âm /θ/', 'âm cuối'],
  pronWords: ['museum', 'healthy'],
  meanWords: ['museum, healthy', 'museum'],
  spellWords: ['because', 'beautiful'],
  wrong: ['chia động từ', 'sắp xếp câu', 'chia động từ'],
  note: ['Tập trung, tích cực phát biểu'],
}

function buildClass(name: string, teacher: string, level: string, students: Student[], n: number): ClassData {
  const r = RUBRICS[level]
  const sessions = []
  for (let i = 0; i < n; i++) {
    const entries: Record<string, SessionEntry> = {}
    students.forEach((st, idx) => {
      if (idx === 2 && i === 2) {
        entries[st.id] = { ...emptyEntry(), attendance: 'excused' as AttendanceKey, note: 'Làm bù' }
        return
      }
      const q = Math.min(1, 0.74 + ((idx * 7 + i * 5) % 20) / 100 + i * 0.008)
      const e: SessionEntry = emptyEntry()
      if (idx === 1 && i === 1) e.attendance = 'late' as AttendanceKey
      r.comps.forEach((c, ci) => {
        if (c.type === 'score') {
          e.scores[c.key] = Math.round(c.max * q)
          const errs = (c.tags ?? []).filter((t) => !t.good)
          e.tags[c.key] = q > 0.92
            ? (c.tags ?? []).filter((t) => t.good).map((t) => t.id)
            : [errs[(idx + i + ci) % errs.length].id]
        } else if (c.type === 'ticks') {
          const items = c.items ?? []
          e.ticks[c.key] = items.slice(0, q > 0.85 ? items.length : items.length - 1).map((t) => t.id)
        } else if (c.type === 'choice') {
          e.choice[c.key] = q > 0.86 ? (c.options ?? [])[0].id : (c.options ?? [])[1].id
        } else if (c.type === 'parts') {
          const m: Record<string, number> = {}
          ;(c.parts ?? []).forEach((p, k) => {
            m[p.id] = q > 0.9 || (idx + i + k) % 3 !== 0 ? p.max : Math.round(p.max * 0.6)
          })
          e.parts[c.key] = m
        }
        ;(c.evidence ?? []).forEach((ev) => {
          e.ev[c.key] = e.ev[c.key] ?? {}
          if (ev.type === 'ratio') {
            e.ev[c.key][ev.key] = { ok: Math.round(20 * q), total: 20 } as unknown as string
          } else if (SAMPLE[ev.key] && q < 0.92) {
            e.ev[c.key][ev.key] = SAMPLE[ev.key][(idx + i) % SAMPLE[ev.key].length]
          }
        })
      })
      entries[st.id] = e
    })
    const d = new Date()
    d.setDate(d.getDate() - (n - i) * 3)
    sessions.push({ id: uid(), no: i + 1, date: d.toISOString().slice(0, 10), entries })
  }
  return {
    id: uid(),
    name,
    teacher,
    level: level as 'primary' | 'secondary',
    perMonth: level === 'primary' ? 8 : 12,
    students,
    sessions,
    comments: {},
  }
}

export function seed(): AppData {
  const mk = (names: string[]): Student[] => names.map((n) => ({ id: uid(), name: n }))
  return {
    classes: [
      buildClass('Lớp 3B', 'Cô Oanh', 'primary', mk(['Bin', 'Su', 'Bống', 'Nam', 'Chi', 'Lâm', 'Thảo', 'Hoàng']), 8),
      buildClass('Lớp 6A', 'Cô Oanh', 'secondary', mk(['Minh', 'An', 'Huy', 'Tuấn', 'Linh', 'Ngọc', 'Bảo', 'Hà', 'Khánh', 'Trang', 'Duy', 'Mai']), 8),
    ],
  }
}

export function normalize(d: unknown): AppData {
  const raw = d as Partial<AppData>
  return {
    classes: (raw.classes ?? []).map((c) => ({
      id: c.id ?? uid(),
      name: c.name ?? 'Lớp',
      teacher: c.teacher ?? '',
      level: RUBRICS[c.level ?? ''] ? (c.level as 'primary' | 'secondary') : 'primary',
      perMonth: c.perMonth ?? (c.level === 'primary' ? 8 : 12),
      students: (c.students ?? []).map((s) => ({ id: s.id ?? uid(), name: s.name ?? '' })),
      sessions: (c.sessions ?? []).map((s, i) => ({
        id: s.id ?? uid(),
        no: s.no ?? i + 1,
        date: s.date ?? todayISO(),
        entries: Object.fromEntries(
          Object.entries(s.entries ?? {}).map(([k, e]) => [
            k,
            {
              ...emptyEntry(),
              ...e,
              scores: e.scores ?? {},
              tags: e.tags ?? {},
              ticks: e.ticks ?? {},
              choice: e.choice ?? {},
              parts: e.parts ?? {},
              skip: e.skip ?? {},
              ev: e.ev ?? {},
            },
          ]),
        ),
      })),
      comments: c.comments ?? {},
    })),
  }
}
