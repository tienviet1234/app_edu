import type { AppData, SessionEntry } from '@/types'
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

export function seed(): AppData {
  return { classes: [] }
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
        homework: s.homework ?? '',
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
      extraComps: c.extraComps ?? [],
    })),
  }
}
