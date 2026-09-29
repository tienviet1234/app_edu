// Bộ màu "thẻ từ vựng": nền bàn xanh xám nhạt, thẻ trắng, mực xanh đen, và 4 màu
// băng nhãn (cobalt, cà chua, hoa hướng dương, cỏ) dùng để phân loại tiêu chí.
export const C = {
  board:  '#1E2F8F',   // cobalt đậm — thanh trên cùng, nút chính
  board2: '#2447D6',   // cobalt tươi — băng nhãn chính, liên kết, điểm nhấn
  paper:  '#EEF1F8',   // mặt bàn — nền trang
  card:   '#FFFFFF',   // mặt thẻ
  ink:    '#14182B',   // mực chữ chính (xanh đen, không phải đen thuần)
  muted:  '#5B6478',   // chữ phụ
  line:   '#D5DAE8',   // viền, đường kẻ
  red:    '#D93A2B',   // lỗi / hành động xóa
  gold:   '#F5B700',   // hoa hướng dương — băng nhãn vàng, sao
  blue:   '#3B6FE0',   // thông tin

  // ── Màu băng nhãn / trạng thái ─────────────────────────
  emerald: '#178A4C',  // cỏ — có mặt, điểm cao, thành công (đủ tương phản trên nền trắng)
  rose:    '#E8503A',  // cà chua — băng nhãn đỏ, điểm thấp, vắng không phép
  violet:  '#6B3FC9',  // huy hiệu đặc biệt, hạng cao nhất
  amber:   '#B45309',  // điểm trung bình, đi muộn (chữ đọc được trên nền trắng)

  // Nền phẳng — thẻ không dùng chuyển màu
  gradHeader:  '#1E2F8F',
  gradGold:    '#F5B700',
  gradSuccess: '#178A4C',

  scoreHigh: '#178A4C',  // ≥ 80
  scoreMid:  '#B45309',  // 65–79
  scoreLow:  '#D93A2B',  // < 65
} as const

/** 4 màu băng nhãn quay vòng — mỗi tiêu chí chấm được gán 1 màu cố định theo thứ tự. */
export const TAB_COLORS = [C.board2, C.rose, C.gold, C.emerald] as const

/** Màu băng nhãn của tiêu chí thứ i (quay vòng nếu có hơn 4 tiêu chí). */
export const tabColor = (i: number): string => TAB_COLORS[i % TAB_COLORS.length]

/** Chọn màu theo điểm số — dùng cho EntryScreen, Dashboard, Leaderboard */
export function scoreColor(val: number | null): string {
  if (val === null) return C.muted
  if (val >= 80) return C.scoreHigh
  if (val >= 65) return C.scoreMid
  return C.scoreLow
}
