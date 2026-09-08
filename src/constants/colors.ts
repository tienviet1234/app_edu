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
