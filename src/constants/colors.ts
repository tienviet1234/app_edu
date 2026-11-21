export const C = {
  board:  '#1E3A8A',   // deep indigo-navy — header, primary buttons
  board2: '#2563EB',   // vivid blue — links, accents, secondary elements
  paper:  '#F1F5F9',   // slate-100 — page background
  card:   '#FFFFFF',   // white card surface
  ink:    '#0F172A',   // slate-900 — primary text
  muted:  '#64748B',   // slate-500 — secondary text
  line:   '#E2E8F0',   // slate-200 — borders & dividers
  red:    '#DC2626',   // error / destructive actions
  gold:   '#F59E0B',   // amber — alerts, gold accents
  blue:   '#3B82F6',   // informational blue

  // ── Bổ sung (redesign phase A) ──────────────────────────
  emerald: '#10B981',  // success, "có mặt", điểm ≥80
  rose:    '#F43F5E',  // điểm <60, "vắng không phép" (đậm hơn red)
  violet:  '#7C3AED',  // badge đặc biệt, rank cao nhất
  amber:   '#D97706',  // điểm 65–79, "trễ" (đậm hơn gold)

  gradHeader:  'linear-gradient(160deg, #1E3A8A 0%, #1D4ED8 100%)',
  gradGold:    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
  gradSuccess: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',

  scoreHigh: '#10B981',  // ≥ 80
  scoreMid:  '#D97706',  // 65–79
  scoreLow:  '#F43F5E',  // < 65
} as const

/** Chọn màu theo điểm số — dùng cho EntryScreen, Dashboard, Leaderboard */
export function scoreColor(val: number | null): string {
  if (val === null) return C.muted
  if (val >= 80) return C.scoreHigh
  if (val >= 65) return C.scoreMid
  return C.scoreLow
}

/** Màu ô ở Bảng chấm điểm (21/11): ô đã nhập/đã chọn tô ĐẬM theo mức đạt để giáo viên thấy ngay ô
 *  nào đã chấm; ô trống trắng, viền nét đứt. Các mức khác nhau cả độ sáng (không chỉ khác màu).
 *  `one` = chế độ "một màu cho mọi ô đã nhập". */
export const SHEET_PAINT = {
  empty:   { bg: '#FFFFFF', fg: '#0F172A', bd: '2px dashed #94A3B8' },
  full:    { bg: '#15803D', fg: '#FFFFFF', bd: '2px solid #15803D' },
  good:    { bg: '#4ADE80', fg: '#052E16', bd: '2px solid #22C55E' },
  mid:     { bg: '#FACC15', fg: '#422006', bd: '2px solid #EAB308' },
  low:     { bg: '#FB923C', fg: '#431407', bd: '2px solid #F97316' },
  zero:    { bg: '#E11D48', fg: '#FFFFFF', bd: '2px solid #E11D48' },
  ticked:  { bg: '#2563EB', fg: '#FFFFFF', bd: '2px solid #2563EB' },
  text:    { bg: '#F5F3FF', fg: '#0F172A', bd: '2px solid #7C3AED' },
  present: { bg: '#15803D', fg: '#FFFFFF', bd: '2px solid #15803D' },
  late:    { bg: '#F59E0B', fg: '#422006', bd: '2px solid #F59E0B' },
  excused: { bg: '#2563EB', fg: '#FFFFFF', bd: '2px solid #2563EB' },
  absent:  { bg: '#E11D48', fg: '#FFFFFF', bd: '2px solid #E11D48' },
  one:     { bg: '#1D4ED8', fg: '#FFFFFF', bd: '2px solid #1D4ED8' },
  error:   { bg: '#FEE2E2', fg: '#7F1D1D', bd: '3px solid #DC2626' },
  locked:  { bg: '#F1F5F9', fg: '#94A3B8', bd: '1px solid #E2E8F0' },
} as const
