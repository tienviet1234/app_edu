export type QuestionType = 'mcq' | 'fill' | 'truefalse' | 'match'

export interface McqQuestion {
  id: string
  type: 'mcq'
  text: string
  options: string[]
  correctIndexes: number[]
}

export interface FillQuestion {
  id: string
  type: 'fill'
  text: string           // câu có chứa ___ đại diện chỗ trống
  acceptedAnswers: string[]
}

export interface TrueFalseQuestion {
  id: string
  type: 'truefalse'
  text: string
  correctAnswer: boolean
}

export interface MatchQuestion {
  id: string
  type: 'match'
  pairs: { left: string; right: string }[]
}

export type Question = McqQuestion | FillQuestion | TrueFalseQuestion | MatchQuestion

// ── Dạng câu hỏi khi trả về cho học sinh (đã ẩn đáp án đúng) ──────────────────
export interface McqQuestionSafe {
  id: string
  type: 'mcq'
  text: string
  options: string[]
}
export interface FillQuestionSafe {
  id: string
  type: 'fill'
  text: string
}
export interface TrueFalseQuestionSafe {
  id: string
  type: 'truefalse'
  text: string
}
export interface MatchQuestionSafe {
  id: string
  type: 'match'
  left: string[]
  rightOptions: string[]
}
export type QuestionSafe = McqQuestionSafe | FillQuestionSafe | TrueFalseQuestionSafe | MatchQuestionSafe
