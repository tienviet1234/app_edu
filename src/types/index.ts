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
  stayHours?: number   // giờ ở lại học thêm khi không thuộc bài
  homeHours?: number   // giờ tự học ở nhà
}

// ─── Session ──────────────────────────────────────────────────────────────────
// Mỗi học sinh có chuỗi buổi học độc lập — 1 Session luôn thuộc về đúng 1 học
// sinh (đặt trong Student.sessions), không còn dùng chung cho cả lớp.
export interface Session {
  id: string
  no: number
  date: string
  homework?: string   // bài tập về nhà riêng cho học sinh này, buổi này
  entry: SessionEntry
  maxes?: Record<string, number> // overrides comp.max per session (e.g. mini=30, listen=15, hw__correct=20)
  createdByName?: string // giáo viên đã ghi buổi này
  recordedAt?: string    // thời điểm thực sự ghi buổi này (ISO datetime) — để xem giờ chi tiết
}

// ─── Extra scoring component (admin-added) ────────────────────────────────────
export interface ExtraComp {
  key: string
  label: string
  max: number
  type?: 'score' | 'choice' | 'parts'
  options?: Array<{ id: string; label: string; pts: number }>
  parts?: Array<{ id: string; label: string; max: number }>
}

// ─── Student ──────────────────────────────────────────────────────────────────
export interface Student {
  id: string
  name: string
  avatar?: string
  /** Ghi chú đặc điểm nét chữ viết tay (VD "hay viết 't' giống 'l'") — giáo
   *  viên tự gõ, dùng làm gợi ý thêm khi "Chấm kỹ hơn" ở tính năng Chấm
   *  bằng AI. Không lưu ảnh chữ viết tay nào cả, chỉ vài dòng chữ mô tả. */
  handwritingNote?: string
  sessions: Session[]
}

// ─── Class ────────────────────────────────────────────────────────────────────
export interface ClassData {
  id: string
  name: string
  teacher: string
  level: RubricLevel
  perMonth: number
  students: Student[]
  comments: Record<string, string>
  extraComps?: ExtraComp[]   // admin-defined extra scoring components
  hiddenComps?: string[]     // keys of standard comps hidden for this class
  // Admin chỉnh điểm từng phần nhỏ/mức của tiêu chí GỐC (không phải tiêu chí
  // tùy chỉnh) — key ngoài = comp.key, key trong = part.id/option.id/item.id,
  // riêng comp loại 'score' (không có phần nhỏ) dùng key đặc biệt '_max'.
  compOverrides?: Record<string, Record<string, number>>
  // Admin đổi TÊN tiêu chí gốc/tên từng phần nhỏ — cùng cấu trúc key như
  // compOverrides ở trên, riêng '_label' đổi tên chính tiêu chí đó.
  compLabelOverrides?: Record<string, Record<string, string>>
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
  /** Tổng mức tối đa THẬT của monthTotal — theo rubric lớp này (đã áp tiêu
   *  chí ẩn/thêm/đổi max riêng cho lớp), KHÔNG LUÔN LÀ 100. Luôn hiển thị
   *  monthTotal kèm mẫu số này, không hardcode "/100". */
  monthMax: number
  /** % (0–100) đạt được của từng tiêu chí — điểm đạt / tối đa CỦA ĐÚNG những
   *  buổi đã chấm mục đó, không phải điểm thô so với 1 mức tối đa cố định
   *  (mỗi buổi có thể có "Số câu" override khác nhau). */
  catAvg: Record<string, number>
  /** % (0–100) của từng phần nhỏ trong tiêu chí kiểu "parts", cùng ý nghĩa như catAvg. */
  partAvg: Record<string, number>
  /** Điểm đạt/tối đa THẬT của từng tiêu chí (đã cộng đúng theo mức của từng
   *  buổi) — dùng hiển thị "bao nhiêu trên bao nhiêu" thay vì chỉ đưa số %. */
  catPts: Record<string, { earned: number; max: number }>
  /** Cùng ý nghĩa như catPts, cho từng phần nhỏ trong tiêu chí kiểu "parts". */
  partPts: Record<string, { earned: number; max: number }>
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
