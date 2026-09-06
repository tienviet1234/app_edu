import { uid } from './uid'
import type { Question, McqQuestion, FillQuestion, TrueFalseQuestion, MatchQuestion } from '@/types/quiz'

/**
 * Cú pháp rút gọn kiểu YourHomework cho 4 dạng: mcq, fill, truefalse, match.
 * Mỗi hàm parse trả về danh sách câu hỏi + lỗi (nếu có) để hiện cho giáo viên sửa.
 */

export interface ParseResult<T> {
  questions: T[]
  errors: string[]
}

// ── Trắc nghiệm ──────────────────────────────────────────────────────────────
// Câu 1: What is she doing?
// A. She reading.
// ==B. She is reading.
// C. She read.
// D. She reads.
export function parseMcq(raw: string): ParseResult<McqQuestion> {
  const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const questions: McqQuestion[] = []
  const errors: string[] = []

  blocks.forEach((block, bi) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 3) { errors.push(`Câu ${bi + 1}: thiếu đề bài hoặc lựa chọn`); return }

    const text = lines[0].replace(/^Câu\s*\d+\s*:\s*/i, '')
    const options: string[] = []
    const correctIndexes: number[] = []

    lines.slice(1).forEach((line, oi) => {
      const isCorrect = line.startsWith('==')
      const cleaned = line.replace(/^==/, '').replace(/^[A-D]\.\s*/, '')
      options.push(cleaned)
      if (isCorrect) correctIndexes.push(oi)
    })

    if (correctIndexes.length === 0) { errors.push(`Câu ${bi + 1}: chưa đánh dấu đáp án đúng (==)`); return }
    questions.push({ id: uid(), type: 'mcq', text, options, correctIndexes })
  })

  return { questions, errors }
}

export function serializeMcq(qs: McqQuestion[]): string {
  return qs.map((q, i) => {
    const lines = [`Câu ${i + 1}: ${q.text}`]
    const letters = ['A', 'B', 'C', 'D', 'E', 'F']
    q.options.forEach((o, oi) => {
      const mark = q.correctIndexes.includes(oi) ? '==' : ''
      lines.push(`${mark}${letters[oi]}. ${o}`)
    })
    return lines.join('\n')
  }).join('\n\n')
}

// ── Điền từ ──────────────────────────────────────────────────────────────────
// 1. She {{goes}} to school every day.
// 2. Where does he live? {{Da Nang.;He lives in Da Nang.}}
export function parseFill(raw: string): ParseResult<FillQuestion> {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const questions: FillQuestion[] = []
  const errors: string[] = []

  lines.forEach((line, i) => {
    const cleaned = line.replace(/^\d+\.\s*/, '')
    const match = cleaned.match(/\{\{(.+?)\}\}/)
    if (!match) { errors.push(`Dòng ${i + 1}: thiếu {{đáp án}}`); return }
    const acceptedAnswers = match[1].split(';').map((s) => s.trim()).filter(Boolean)
    if (acceptedAnswers.length === 0) { errors.push(`Dòng ${i + 1}: {{}} trống`); return }
    const text = cleaned.replace(/\{\{.+?\}\}/, '___')
    questions.push({ id: uid(), type: 'fill', text, acceptedAnswers })
  })

  return { questions, errors }
}

export function serializeFill(qs: FillQuestion[]): string {
  return qs.map((q, i) => {
    const blank = `{{${q.acceptedAnswers.join(';')}}}`
    return `${i + 1}. ${q.text.replace('___', blank)}`
  }).join('\n')
}

// ── Đúng / Sai ───────────────────────────────────────────────────────────────
// Mai is nine years old.
// T
//
// Her father is a doctor.
// F
export function parseTrueFalse(raw: string): ParseResult<TrueFalseQuestion> {
  const blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const questions: TrueFalseQuestion[] = []
  const errors: string[] = []

  blocks.forEach((block, i) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) { errors.push(`Câu ${i + 1}: thiếu T hoặc F`); return }
    const [text, mark] = lines
    if (!/^[TF]$/i.test(mark)) { errors.push(`Câu ${i + 1}: dòng đáp án phải là T hoặc F`); return }
    questions.push({ id: uid(), type: 'truefalse', text, correctAnswer: mark.toUpperCase() === 'T' })
  })

  return { questions, errors }
}

export function serializeTrueFalse(qs: TrueFalseQuestion[]): string {
  return qs.map((q) => `${q.text}\n${q.correctAnswer ? 'T' : 'F'}`).join('\n\n')
}

// ── Ghép cặp ─────────────────────────────────────────────────────────────────
// What is your name?==My name is Nam.
// How old are you?==I am ten years old.
export function parseMatch(raw: string): ParseResult<MatchQuestion> {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  const errors: string[] = []
  const pairs: { left: string; right: string }[] = []

  lines.forEach((line, i) => {
    const parts = line.split('==')
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      errors.push(`Dòng ${i + 1}: cần đúng cú pháp "vế trái==vế phải"`)
      return
    }
    pairs.push({ left: parts[0].trim(), right: parts[1].trim() })
  })

  if (errors.length === 0 && pairs.length < 2) errors.push('Cần ít nhất 2 cặp để ghép')

  return { questions: pairs.length ? [{ id: uid(), type: 'match', pairs }] : [], errors }
}

export function serializeMatch(qs: MatchQuestion[]): string {
  const pairs = qs[0]?.pairs ?? []
  return pairs.map((p) => `${p.left}==${p.right}`).join('\n')
}

// ── Dispatcher chung ─────────────────────────────────────────────────────────
export function parseQuestions(type: Question['type'], raw: string): ParseResult<Question> {
  if (type === 'mcq') return parseMcq(raw)
  if (type === 'fill') return parseFill(raw)
  if (type === 'truefalse') return parseTrueFalse(raw)
  return parseMatch(raw)
}
