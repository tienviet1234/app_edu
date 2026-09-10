import type { RubricDef, ClassData } from '@/types'
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

/** Đoán rubric level từ tên lớp — lớp 1-5 dùng phiếu Cấp 1, còn lại Cấp 2&3 */
export function autoLevel(name: string): 'primary' | 'secondary' {
  const m = String(name).match(/\d+/)
  const g = m ? Number(m[0]) : 0
  return g >= 1 && g <= 5 ? 'primary' : 'secondary'
}

function extraToComp(ec: import('@/types').ExtraComp): import('@/types').RubricComponent {
  if (ec.type === 'choice' && ec.options?.length) {
    return { key: ec.key, label: ec.label, max: ec.max, type: 'choice', options: ec.options }
  }
  if (ec.type === 'parts' && ec.parts?.length) {
    return {
      key: ec.key, label: ec.label,
      max: ec.parts.reduce((a, p) => a + p.max, 0),
      type: 'parts', parts: ec.parts,
    }
  }
  return { key: ec.key, label: ec.label, max: ec.max, type: 'score' as const }
}

/** Áp override điểm từng phần nhỏ/mức (do admin chỉnh) lên 1 tiêu chí GỐC —
 *  tổng max luôn tính lại từ các phần nhỏ, không bao giờ lệch với thực tế
 *  chấm điểm được (xem business/scoring.ts compScore). */
export function applyCompOverride(
  comp: import('@/types').RubricComponent,
  overrides: Record<string, number> | undefined,
): import('@/types').RubricComponent {
  if (!overrides) return comp
  if (comp.type === 'parts' && comp.parts) {
    const parts = comp.parts.map((p) => (overrides[p.id] != null ? { ...p, max: overrides[p.id] } : p))
    return { ...comp, parts, max: parts.reduce((a, p) => a + p.max, 0) }
  }
  if (comp.type === 'choice' && comp.options) {
    const options = comp.options.map((o) => (overrides[o.id] != null ? { ...o, pts: overrides[o.id] } : o))
    return { ...comp, options, max: options.reduce((a, o) => Math.max(a, o.pts), 0) }
  }
  if (comp.type === 'ticks' && comp.items) {
    const items = comp.items.map((it) => (overrides[it.id] != null ? { ...it, pts: overrides[it.id] } : it))
    return { ...comp, items, max: items.reduce((a, it) => a + it.pts, 0) }
  }
  if (comp.type === 'score' && overrides._max != null) {
    return { ...comp, max: overrides._max }
  }
  return comp
}

/** Áp override TÊN (do admin đổi) lên 1 tiêu chí GỐC — '_label' đổi tên
 *  chính tiêu chí, còn lại đổi tên từng phần nhỏ/mức theo id. */
export function applyCompLabelOverride(
  comp: import('@/types').RubricComponent,
  labels: Record<string, string> | undefined,
): import('@/types').RubricComponent {
  if (!labels) return comp
  let next = comp
  if (labels._label) next = { ...next, label: labels._label }
  if (next.type === 'parts' && next.parts) {
    next = { ...next, parts: next.parts.map((p) => (labels[p.id] ? { ...p, label: labels[p.id] } : p)) }
  } else if (next.type === 'choice' && next.options) {
    next = { ...next, options: next.options.map((o) => (labels[o.id] ? { ...o, label: labels[o.id] } : o)) }
  } else if (next.type === 'ticks' && next.items) {
    next = { ...next, items: next.items.map((it) => (labels[it.id] ? { ...it, label: labels[it.id] } : it)) }
  }
  return next
}

export function getClassRubric(cls: ClassData): RubricDef {
  const base = getRubric(cls.level)
  const hidden = new Set(cls.hiddenComps ?? [])
  const extras = cls.extraComps ?? []
  const overrides = cls.compOverrides ?? {}
  const labelOverrides = cls.compLabelOverrides ?? {}
  if (!hidden.size && !extras.length && !Object.keys(overrides).length && !Object.keys(labelOverrides).length) return base
  return {
    ...base,
    comps: [
      ...base.comps
        .filter((c) => !hidden.has(c.key))
        .map((c) => applyCompLabelOverride(applyCompOverride(c, overrides[c.key]), labelOverrides[c.key])),
      ...extras.map(extraToComp),
    ],
  }
}
