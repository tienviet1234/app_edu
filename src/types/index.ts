// ─── Rubric Level ────────────────────────────────────────────────────────────
export type RubricLevel = 'primary' | 'secondary'

// ─── Attendance ───────────────────────────────────────────────────────────────
export type AttendanceKey = 'present' | 'late' | 'excused' | 'absent'

// ─── Tag ──────────────────────────────────────────────────────────────────────
export interface Tag {
  id: string
  label: string
  good?: boolean
  weak?: string
  fix?: string
}

// ─── Rubric Component ─────────────────────────────────────────────────────────
export interface RubricPart {
  id: string
  label: string
  max: number
  weak?: string
  fix?: string
}

export interface RubricOption {
  id: string
  label: string
  pts: number
  err?: { id: string; label: string; weak: string; fix: string }
}

export interface RubricEvidence {
  key: string
  type: 'ratio' | 'list' | 'text' | 'words'
  label: string
  ph?: string
  unit?: string
}

export type ComponentType = 'score' | 'ticks' | 'choice' | 'parts'

export interface RubricComponent {
  key: string
  label: string
  max: number
  type: ComponentType
  tags?: Tag[]
  items?: Array<{ id: string; label: string; pts: number }>
  options?: RubricOption[]
  parts?: RubricPart[]
  stars?: boolean
  evidence?: RubricEvidence[]
  zeroLabel?: string
  zeroErr?: { id: string; label: string; weak: string; fix: string }
}

export interface AttendanceConfig {
  mode: 'avg' | 'deduct'
  base?: number
}

export interface RubricDef {
  label: string
  icons: Record<string, string>
  comps: RubricComponent[]
  attendance: AttendanceConfig
  defaults?: { ticks?: Record<string, string[]> }
}

// ─── Session Entry ─────────────────────────────────────────────────────────────
export interface EvidenceRatio {
  ok: string | number
  total: string | number
}

export interface SessionEntry {
  attendance: AttendanceKey
  scores: Record<string, string | number>
  tags: Record<string, string[]>
  ticks: Record<string, string[]>
  choice: Record<string, string>
  parts: Record<string, Record<string, string | number>>
  skip: Record<string, boolean>
  ev: Record<string, Record<string, string | EvidenceRatio>>
  note: string
}

// ─── Session ──────────────────────────────────────────────────────────────────
export interface Session {
  id: string
  no: number
  date: string
  entries: Record<string, SessionEntry>
}

// ─── Student ──────────────────────────────────────────────────────────────────
export interface Student {
  id: string
  name: string
  avatar?: string
}

// ─── Class ────────────────────────────────────────────────────────────────────
export interface ClassData {
  id: string
  name: string
  teacher: string
  level: RubricLevel
  perMonth: number
  students: Student[]
  sessions: Session[]
  comments: Record<string, string>
}

// ─── App Data ─────────────────────────────────────────────────────────────────
export interface AppData {
  classes: ClassData[]
}

// ─── Rank ─────────────────────────────────────────────────────────────────────
export interface Rank {
  min: number
  name: string
  color: string
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export interface EvidenceItem {
  text: string
  n: number
}

export interface ErrorEntry {
  id: string
  label: string
  weak?: string
  fix?: string
  comp: string
  count: number
}

export interface StudentStats {
  totals: number[]
  avg: number
  monthTotal: number
  catAvg: Record<string, number>
  partAvg: Record<string, number>
  evidence: Record<string, EvidenceItem[]>
  ratio: Record<string, { ok: number; total: number }>
  errors: ErrorEntry[]
  progress: number
  attendScore: number
  errorsFor: (comp: RubricComponent) => ErrorEntry[]
  present: number
  late: number
  excused: number
  absent: number
  attended: number
  counted: number
  hwRate: number
  stars: number
  perfect: number
  exp: number
  level: number
  expInLevel: number
  toNext: number
  streak: number
  currentStreak: number
  rank: Rank
}

export interface RankingEntry {
  student: Student
  s: StudentStats
  place: number
}

// ─── Detail Block ─────────────────────────────────────────────────────────────
export interface DetailBlock {
  icon: string
  title: string
  lines: string[]
}
