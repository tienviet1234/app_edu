import type { IQuestion } from '../models/Assignment.js'
import type { IQuizAnswer } from '../models/Submission.js'

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function gradeOne(q: IQuestion, raw: unknown): IQuizAnswer {
  switch (q.type) {
    case 'mcq': {
      const chosen = Array.isArray(raw) ? (raw as number[]) : []
      const correct = q.correctIndexes ?? []
      const ok =
        chosen.length === correct.length &&
        [...chosen].sort().every((v, i) => v === [...correct].sort()[i])
      const correctText = correct.map((i) => q.options?.[i]).filter(Boolean).join(' / ')
      return { questionId: q.id, value: chosen, correct: ok, correctText }
    }
    case 'fill': {
      const text = typeof raw === 'string' ? raw : ''
      const accepted = q.acceptedAnswers ?? []
      const ok = accepted.some((a) => normalize(a) === normalize(text))
      return { questionId: q.id, value: text, correct: ok, correctText: accepted[0] }
    }
    case 'truefalse': {
      const val = typeof raw === 'boolean' ? raw : null
      const ok = val !== null && val === q.correctAnswer
      return { questionId: q.id, value: !!val, correct: ok, correctText: q.correctAnswer ? 'Đúng' : 'Sai' }
    }
    case 'match': {
      // raw: mảng right-side theo thứ tự left-side gốc, học sinh đã ghép
      const chosen = Array.isArray(raw) ? (raw as string[]) : []
      const pairs = q.pairs ?? []
      const correctOrder = pairs.map((p) => p.right)
      const ok =
        chosen.length === correctOrder.length &&
        chosen.every((v, i) => v === correctOrder[i])
      const correctText = pairs.map((p) => `${p.left} → ${p.right}`).join('; ')
      return { questionId: q.id, value: chosen, correct: ok, correctText }
    }
    default:
      return { questionId: q.id, value: '', correct: false }
  }
}

/** Chấm toàn bộ câu trả lời, trả về danh sách kết quả + điểm 0-100 */
export function gradeQuiz(
  questions: IQuestion[],
  rawAnswers: Record<string, unknown>,
): { answers: IQuizAnswer[]; score: number } {
  const answers = questions.map((q) => gradeOne(q, rawAnswers[q.id]))
  const correctCount = answers.filter((a) => a.correct).length
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0
  return { answers, score }
}
