import type { AppData, Session, SessionEntry } from '@/types'
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

function normalizeEntry(e: unknown): SessionEntry {
  const raw = (e ?? {}) as Partial<SessionEntry>
  return {
    ...emptyEntry(),
    ...raw,
    scores: raw.scores ?? {},
    tags: raw.tags ?? {},
    ticks: raw.ticks ?? {},
    choice: raw.choice ?? {},
    parts: raw.parts ?? {},
    skip: raw.skip ?? {},
    ev: raw.ev ?? {},
  }
}

function normalizeSession(s: unknown, i: number): Session {
  const raw = s as Partial<Session> & { entries?: Record<string, unknown> }
  return {
    id: raw.id ?? uid(),
    no: raw.no ?? i + 1,
    date: raw.date ?? todayISO(),
    homework: raw.homework ?? '',
    entry: normalizeEntry(raw.entry),
    maxes: raw.maxes,
    createdByName: raw.createdByName,
    recordedAt: raw.recordedAt,
  }
}

export function normalize(d: unknown): AppData {
  const raw = d as { classes?: unknown[] }
  return {
    classes: (raw.classes ?? []).map((cRaw) => {
      const c = cRaw as Record<string, unknown> & {
        id?: string; name?: string; teacher?: string; level?: string; perMonth?: number
        students?: unknown[]
        sessions?: Array<{ id?: string; no?: number; date?: string; homework?: string; maxes?: Record<string, number>; entries?: Record<string, unknown> }>
        comments?: Record<string, string>; extraComps?: AppData['classes'][number]['extraComps']; hiddenComps?: string[]
      }
      const level = RUBRICS[c.level ?? ''] ? (c.level as 'primary' | 'secondary') : 'primary'

      const students = (c.students ?? []).map((sRaw) => {
        const s = sRaw as { id?: string; name?: string; avatar?: string; sessions?: unknown[] }
        return {
          id: s.id ?? uid(),
          name: s.name ?? '',
          avatar: s.avatar,
          sessions: Array.isArray(s.sessions) ? s.sessions.map((x, i) => normalizeSession(x, i)) : [],
        }
      })

      // Dữ liệu cũ (trước bản "buổi học riêng từng học sinh"): buổi dùng chung
      // cả lớp + entries theo studentId — fan-out sang student.sessions, giữ
      // nguyên thứ tự thời gian, không mất dữ liệu đã nhập.
      if (Array.isArray(c.sessions)) {
        const counters: Record<string, number> = {}
        c.sessions.forEach((legacy) => {
          Object.entries(legacy.entries ?? {}).forEach(([sid, entry]) => {
            const student = students.find((s) => s.id === sid)
            if (!student) return
            counters[sid] = (counters[sid] ?? 0) + 1
            student.sessions.push({
              id: uid(),
              no: counters[sid],
              date: legacy.date ?? todayISO(),
              homework: legacy.homework ?? '',
              entry: normalizeEntry(entry),
              maxes: legacy.maxes,
            })
          })
        })
        students.forEach((s) => s.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no))
      }

      return {
        id: c.id ?? uid(),
        name: c.name ?? 'Lớp',
        teacher: c.teacher ?? '',
        level,
        perMonth: c.perMonth ?? (c.level === 'primary' ? 8 : 12),
        students,
        comments: c.comments ?? {},
        extraComps: c.extraComps ?? [],
        hiddenComps: c.hiddenComps ?? [],
      }
    }),
  }
}
