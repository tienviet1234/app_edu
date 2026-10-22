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
  /** Buổi này ĐÃ nằm trong 1 khoản học phí đã gửi (TuitionNotice) hoặc được
   *  admin tự xác nhận "đã tính tiền trước đó" — dùng để LOẠI RA khỏi mọi
   *  phép tính "còn thiếu bao nhiêu buổi" (xem unbilledSessionsOf ở
   *  business/tuition.ts). Không có field này thì KHÔNG ảnh hưởng gì (coi
   *  như false) — chỉ đặt true khi admin xác nhận đã thu tiền buổi đó rồi,
   *  tránh xóa buổi lỗi/trùng trong 1 kỳ đã thu tiền làm hệ thống "quên"
   *  mất là đã thu, tính trùng lại các buổi còn sót. */
  billed?: boolean
  /** CHỈ trên máy, không gửi lên server. true = máy này đã sửa điểm/bài tập/
   *  số câu của buổi mà server CHƯA xác nhận — phải đẩy lên (kể cả ghi đè),
   *  không được để server ghi đè ngược xuống. Đặt ở findOrCreateSession
   *  (mọi chỗ sửa ở Nhập điểm đều đi qua), xóa khi server xác nhận ĐÚNG bản
   *  đã gửi. Xem business/sync.ts syncStudentsFromServer. */
  dirty?: boolean
  /** CHỈ trên máy. true = nội dung buổi này ĐÃ khớp server ít nhất 1 lần (tải
   *  từ server hoặc server xác nhận lưu) → an toàn để làm mới từ server khi
   *  máy khác sửa. Không có (dữ liệu cũ trước bản cập nhật) = không biết bản
   *  nào đúng → không tự ghi đè bằng bản server. */
  synced?: boolean
  /** CHỈ trên máy. `updatedAt` của bản điểm trên server mà nội dung máy đang
   *  dựa vào — gửi kèm khi lưu để server phát hiện máy khác đã lưu bản mới
   *  hơn trong lúc máy này sửa (2 máy cùng sửa 1 buổi → trước đây bản lưu sau
   *  âm thầm đè mất bản kia). */
  baseUpdatedAt?: string
  /** CHỈ trên máy. Server từ chối lưu vì máy khác đã lưu bản mới hơn — giữ bản
   *  máy kia ở đây để giáo viên tự chọn giữ bản nào (xem resolveConflict). */
  conflict?: SessionConflict
  /** CHỈ trên máy. Dữ liệu cũ (chưa `synced`) KHÁC bản server mà không biết bản
   *  nào đúng → đồng bộ giữ bản máy, ghi bản server ở đây để admin có thể chủ
   *  động "Lấy bản server" (takeServerCopy) — máy không bao giờ tự đè. */
  serverCopy?: ServerCopy
}

export interface ServerCopy {
  entry: SessionEntry
  updatedAt?: string
}

export interface SessionConflict {
  entry: SessionEntry
  total: number
  updatedAt: string
  byName?: string
}

/** Buổi CHƯA lên server (sửa dở / chưa tạo) của học sinh vừa bị gỡ khỏi lớp
 *  (gộp/chuyển lớp) hoặc của lớp vừa bị gỡ khỏi máy — trước đây bị xóa luôn
 *  cùng học sinh/lớp, mất trắng. Giờ giữ lại ở đây (cũng có trong bản chụp
 *  sao lưu gửi server), đẩy được thì tự đẩy, còn lại admin xử lý. */
export interface OrphanRecord {
  classId: string
  className: string
  studentId: string
  studentName: string
  /** replacedByServer = bản cũ trên máy, cất lại khi admin chọn "Lấy bản server". */
  reason: 'studentRemoved' | 'classRemoved' | 'deletedLocal' | 'otherTab' | 'replacedByServer'
  removedAt: string
  sessions: Session[]
}

// ─── Extra scoring component (admin-added)────────────────────────────────────
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
  /** Số buổi học sinh này ĐÃ HỌC TRƯỚC KHI dùng app (chuyển vào giữa chừng,
   *  VD học xong 9 buổi ở sổ giấy rồi mới bắt đầu ghi app) — mặc định 0/không
   *  có = không ảnh hưởng gì (y hệt cách tính cũ). Khi > 0: buổi đầu tiên ghi
   *  trong app sẽ đánh số tiếp theo (offset+1), và các mốc tính đủ kỳ (8/12
   *  buổi) cũng cộng dồn số buổi đã học trước đó — xem business/tuition.ts. */
  sessionOffset?: number
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
  // Admin THÊM mức/phần MỚI vào 1 tiêu chí GỐC đã có sẵn (VD thêm mức thứ 4
  // vào "Bài tập về nhà" đang có 3 mức) — giữ nguyên tiêu chí cũ + dữ liệu đã
  // chấm, khác hẳn "Đổi kiểu" (thay hẳn 1 tiêu chí khác). key ngoài =
  // comp.key, `value` = điểm (pts cho choice/ticks, max cho parts) —
  // xem applyCompExtraItems ở constants/rubrics.ts.
  compExtraItems?: Record<string, Array<{ id: string; label: string; value: number }>>
  // Câu nhận xét mẫu TỰ SOẠN riêng cho lớp này (khác với gợi ý tự sinh từ
  // điểm số) — admin/giáo viên tự thêm/sửa/xóa theo thói quen viết của họ,
  // hiện làm chip chọn nhanh ở màn Nhập điểm (xem EntryScreen).
  customNotePhrases?: string[]
}

// ─── App Data ─────────────────────────────────────────────────────────────────
export interface AppData {
  classes: ClassData[]
  /** Dữ liệu chưa lên server của học sinh/lớp đã bị gỡ khỏi máy — xem OrphanRecord. */
  orphans?: OrphanRecord[]
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
