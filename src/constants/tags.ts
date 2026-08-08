import type { Tag } from '@/types'

export const MINI_TAGS: Tag[] = [
  { id: 'm_gram', label: 'Sai ngữ pháp', weak: 'ngữ pháp', fix: 'củng cố ngữ pháp' },
  { id: 'm_vocab', label: 'Sai từ vựng', weak: 'từ vựng', fix: 'mở rộng vốn từ' },
  { id: 'm_spell', label: 'Sai chính tả', weak: 'chính tả', fix: 'luyện viết chính tả' },
  { id: 'm_pron', label: 'Sai phát âm', weak: 'phát âm', fix: 'luyện phát âm' },
  { id: 'm_read', label: 'Đọc hiểu chưa tốt', weak: 'đọc hiểu', fix: 'luyện kỹ năng đọc hiểu' },
  { id: 'm_learn', label: 'Chưa thuộc bài', weak: 'việc học bài cũ', fix: 'kiểm tra bài cũ đầu mỗi buổi' },
  { id: 'm_care', label: 'Bất cẩn', weak: 'sự bất cẩn khi làm bài', fix: 'rèn thói quen soát lại bài' },
]

export const LISTEN_TAGS: Tag[] = [
  { id: 'l_main', label: 'Nghe đúng ý chính', good: true },
  { id: 'l_key', label: 'Sai từ khóa', weak: 'việc bắt từ khóa', fix: 'luyện nghe bắt từ khóa' },
  { id: 'l_spell', label: 'Sai chính tả khi nghe', weak: 'chính tả khi nghe', fix: 'luyện chính tả khi nghe' },
  { id: 'l_speed', label: 'Không nghe kịp tốc độ', weak: 'tốc độ nghe', fix: 'luyện nghe ở tốc độ nhanh hơn' },
  { id: 'l_focus', label: 'Chưa tập trung', weak: 'sự tập trung khi nghe', fix: 'rèn sự tập trung khi nghe' },
  { id: 'l_vocab', label: 'Chưa biết từ vựng', weak: 'vốn từ hạn chế', fix: 'tăng cường luyện từ vựng' },
]

export const HW_TICKS_S = [
  { id: 'h_full', label: 'Hoàn thành đầy đủ', pts: 5 },
  { id: 'h_correct', label: 'Làm đúng yêu cầu', pts: 5 },
  { id: 'h_ontime', label: 'Nộp đúng hạn', pts: 5 },
  { id: 'h_neat', label: 'Viết sạch đẹp', pts: 5 },
]

export const AT_TICKS = [
  { id: 'a_speak', label: 'Chủ động phát biểu', pts: 2 },
  { id: 'a_focus', label: 'Tập trung', pts: 2 },
  { id: 'a_coop', label: 'Hợp tác', pts: 2 },
  { id: 'a_prep', label: 'Chuẩn bị bài', pts: 2 },
  { id: 'a_fix', label: 'Tự giác sửa lỗi', pts: 2 },
]

export const ATTEND = [
  { key: 'present' as const, label: 'Đi học đúng giờ', pts: 10, deduct: 0 },
  { key: 'late' as const, label: 'Đi học muộn', pts: 8, deduct: 2 },
  { key: 'excused' as const, label: 'Nghỉ có phép', pts: 5, deduct: 3 },
  { key: 'absent' as const, label: 'Nghỉ không phép', pts: 0, deduct: 5 },
]

export const TAG_BY_ID: Record<string, Tag> = {}
;[MINI_TAGS, LISTEN_TAGS].forEach((s) =>
  s.forEach((t) => {
    TAG_BY_ID[t.id] = t
  }),
)
