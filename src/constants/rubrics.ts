import type { RubricDef } from '@/types'
import { MINI_TAGS, LISTEN_TAGS, HW_TICKS_S, AT_TICKS } from './tags'

export const RUBRICS: Record<string, RubricDef> = {
  secondary: {
    label: 'Cấp 2 & Cấp 3',
    icons: { mini: '📝', listen: '🎧', hw: '📚', attitude: '⭐' },
    comps: [
      {
        key: 'mini',
        label: 'Mini Test',
        max: 40,
        type: 'score',
        tags: MINI_TAGS,
        evidence: [{ key: 'note', type: 'list', label: 'Lỗi cụ thể cần nhắc' }],
      },
      { key: 'listen', label: 'Listening', max: 20, type: 'score', tags: LISTEN_TAGS },
      {
        key: 'hw',
        label: 'Bài tập về nhà',
        max: 20,
        type: 'ticks',
        items: HW_TICKS_S,
        evidence: [
          { key: 'correct', type: 'ratio', label: 'Kết quả' },
          { key: 'wrong', type: 'list', label: 'Dạng bài còn sai' },
        ],
      },
      {
        key: 'attitude',
        label: 'Thái độ học tập',
        max: 10,
        type: 'ticks',
        items: AT_TICKS,
        stars: true,
      },
    ],
    attendance: { mode: 'avg' },
    defaults: { ticks: { hw: HW_TICKS_S.map((t) => t.id), attitude: AT_TICKS.map((t) => t.id) } },
  },
  primary: {
    label: 'Cấp 1',
    icons: { hw: '📚', video: '🎤', vocab: '📖', attitude: '⭐' },
    comps: [
      {
        key: 'hw',
        label: 'Bài tập về nhà',
        max: 30,
        type: 'choice',
        options: [
          { id: 'full', label: 'Hoàn thành', pts: 30 },
          {
            id: 'partial',
            label: 'Hoàn thành không đầy đủ',
            pts: 15,
            err: { id: 'e_hw_partial', label: 'BTVN chưa đầy đủ', weak: 'việc hoàn thành bài tập', fix: 'nhắc con làm hết bài trước mỗi buổi' },
          },
          {
            id: 'none',
            label: 'Chưa hoàn thành',
            pts: 0,
            err: { id: 'e_hw_none', label: 'Không làm BTVN', weak: 'việc làm bài tập về nhà', fix: 'kèm con làm bài tập ở nhà' },
          },
        ],
        evidence: [
          { key: 'correct', type: 'ratio', label: 'Kết quả', unit: 'câu đúng' },
          { key: 'wrong', type: 'list', label: 'Dạng bài còn sai', ph: 'chia động từ, sắp xếp câu' },
        ],
      },
      {
        key: 'video',
        label: 'Video bài nói',
        max: 30,
        type: 'parts',
        parts: [
          { id: 'full', label: 'Quay đầy đủ theo yêu cầu', max: 10 },
          { id: 'pron', label: 'Phát âm rõ ràng', max: 10, weak: 'phát âm trong video', fix: 'luyện phát âm theo audio mẫu' },
          { id: 'ontime', label: 'Nộp đúng hạn', max: 10, weak: 'việc nộp bài đúng hạn', fix: 'nhắc con nộp video đúng hạn' },
        ],
        zeroLabel: 'Không nộp bài (0 điểm toàn mục)',
        zeroErr: { id: 'e_video_none', label: 'Không nộp video', weak: 'việc nộp video bài nói', fix: 'nhắc con quay và nộp video' },
        evidence: [
          { key: 'pronErr', type: 'words', label: 'Sai phát âm', ph: 'brother, think, thirteen' },
          { key: 'practice', type: 'list', label: 'Cần luyện thêm', ph: 'âm /θ/, âm cuối' },
        ],
      },
      {
        key: 'vocab',
        label: 'Từ vựng',
        max: 20,
        type: 'parts',
        parts: [
          { id: 'pron', label: 'Đọc đúng phát âm', max: 8, weak: 'phát âm từ vựng', fix: 'luyện đọc to từ mới' },
          { id: 'mean', label: 'Hiểu nghĩa từ', max: 6, weak: 'việc nhớ nghĩa của từ', fix: 'dùng flashcard ôn từ' },
          { id: 'spell', label: 'Viết đúng chính tả', max: 6, weak: 'chính tả từ vựng', fix: 'luyện viết lại từ mới' },
        ],
        evidence: [
          { key: 'pronWords', type: 'words', label: 'Từ phát âm chưa đúng', ph: 'museum, healthy' },
          { key: 'meanWords', type: 'words', label: 'Từ chưa nhớ nghĩa', ph: 'museum, healthy' },
          { key: 'spellWords', type: 'words', label: 'Từ viết sai', ph: 'because' },
        ],
      },
      {
        key: 'attitude',
        label: 'Thái độ học tập',
        max: 10,
        type: 'parts',
        parts: [
          { id: 'focus', label: 'Tập trung trong giờ học', max: 4, weak: 'sự tập trung trong giờ', fix: 'rèn sự tập trung cho con' },
          { id: 'active', label: 'Tích cực tham gia hoạt động', max: 3, weak: 'sự chủ động tham gia', fix: 'khuyến khích con phát biểu nhiều hơn' },
          { id: 'polite', label: 'Lễ phép, hợp tác với cô và bạn', max: 3, weak: 'nề nếp hợp tác', fix: 'trao đổi thêm với phụ huynh về nề nếp' },
        ],
        evidence: [{ key: 'note', type: 'text', label: 'Nhận xét ngắn', ph: 'Tập trung, tích cực phát biểu' }],
      },
    ],
    attendance: { mode: 'deduct', base: 10 },
  },
}

export const getRubric = (level: string): RubricDef => RUBRICS[level] ?? RUBRICS.secondary
