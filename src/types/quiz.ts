export type QuestionType = 'mcq' | 'fill' | 'truefalse' | 'match' | 'order' | 'cloze'

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

export interface OrderQuestion {
  id: string
  type: 'order'
  text?: string          // hướng dẫn, không bắt buộc (VD "Sắp xếp thành câu đúng")
  items: string[]        // đúng thứ tự gốc — hiện xáo trộn cho học sinh
}

export interface ClozeQuestion {
  id: string
  type: 'cloze'
  text: string            // đoạn văn, mỗi chỗ trống đánh dấu bằng ___
  blanks: string[][]      // blanks[i] = các đáp án chấp nhận cho ô trống thứ i+1, theo đúng thứ tự xuất hiện trong text
}

export type Question = McqQuestion | FillQuestion | TrueFalseQuestion | MatchQuestion | OrderQuestion | ClozeQuestion

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
export interface OrderQuestionSafe {
  id: string
  type: 'order'
  text?: string
  items: string[]   // đã xáo trộn — KHÔNG phải thứ tự đúng
}
export interface ClozeQuestionSafe {
  id: string
  type: 'cloze'
  text: string       // vẫn chứa ___ ở chỗ trống, không lộ blanks (đáp án)
}
export type QuestionSafe =
  | McqQuestionSafe | FillQuestionSafe | TrueFalseQuestionSafe | MatchQuestionSafe
  | OrderQuestionSafe | ClozeQuestionSafe
