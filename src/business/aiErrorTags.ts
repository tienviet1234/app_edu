import { MINI_TAGS, LISTEN_TAGS } from '@/constants/tags'

// Từ khóa tiếng Việt thường gặp trong câu AI mô tả lỗi (VD "chia động từ sai"
// không chứa chữ "ngữ pháp" nhưng vẫn LÀ lỗi ngữ pháp) — ánh xạ về đúng tag
// có sẵn trong hệ thống, để lỗi AI phát hiện khi "Chấm bằng AI" cũng được
// tính vào "lỗi lặp lại" dùng ở Báo cáo/nhận xét tự động (business/report.ts
// buildComment), thay vì chỉ nằm im trong ghi chú buổi học dạng chữ tự do.
const KEYWORDS: Record<string, string[]> = {
  m_gram: ['ngữ pháp', 'động từ', 'giới từ', 'mạo từ', 'đại từ', 'thì ', 'điều kiện', 'so sánh', 'cấu trúc câu'],
  m_vocab: ['từ vựng', 'nghĩa từ', 'từ mới', 'chọn từ', 'dùng từ'],
  m_spell: ['chính tả', 'viết sai từ'],
  m_pron: ['phát âm'],
  m_read: ['đọc hiểu'],
  m_learn: ['thuộc bài', 'học bài'],
  m_care: ['bất cẩn', 'cẩu thả', 'nhầm lẫn', 'ẩu', 'thiếu tập trung khi làm bài'],
  l_key: ['từ khóa', 'bắt ý'],
  l_spell: ['chính tả'],
  l_speed: ['tốc độ', 'nghe kịp', 'nghe nhanh'],
  l_focus: ['tập trung'],
  l_vocab: ['từ vựng', 'chưa biết từ', 'không biết từ'],
}

/** Đối chiếu lỗi tự do AI mô tả (VD "chia động từ sai", "giới từ") với tag
 *  CÓ SẴN của ĐÚNG tiêu chí đang chấm (Mini Test → MINI_TAGS, Listening →
 *  LISTEN_TAGS) — chỉ khớp theo từ khóa rõ ràng, không đoán bừa. Lỗi không
 *  khớp tag nào vẫn còn nguyên trong ghi chú buổi học (không mất dữ liệu),
 *  chỉ đơn giản không được tính vào "lỗi lặp lại" ở Báo cáo. Tiêu chí khác
 *  Mini Test/Listening (hw, attitude...) không dùng hệ tag lỗi này, trả rỗng. */
export function matchAiErrorTags(errors: string[], compKey: string): string[] {
  const pool = compKey === 'mini' ? MINI_TAGS : compKey === 'listen' ? LISTEN_TAGS : []
  if (!pool.length || !errors.length) return []
  const lower = errors.map((e) => e.toLowerCase())
  const found = new Set<string>()
  pool.forEach((tag) => {
    if (tag.good) return
    const keywords = KEYWORDS[tag.id] ?? []
    if (lower.some((e) => keywords.some((kw) => e.includes(kw)))) found.add(tag.id)
  })
  return [...found]
}
