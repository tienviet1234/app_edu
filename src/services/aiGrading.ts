import { api } from '@/utils/api'

export interface AiGradeResult {
  studentName: string
  rawScore: number
  rawMax: number
  errors: string[]
  lowConfidence: boolean
  unreadable: boolean
  fromExistingGrade: boolean
  needsManualGrading: boolean
  manualGradingReason: string
  nameConfidence: 'high' | 'low'
  questions: Array<{ no: string; studentAnswer: string; correct: boolean; uncertain: boolean }>
  ambiguousItems: Array<{ description: string; suggestions: string[] }>
}

export interface AiSolveResult {
  lines: Array<{ text: string; uncertain: boolean; note: string }>
  lowConfidence: boolean
  unreadable: boolean
}

export const aiGradingService = {
  /** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Chỉ trả gợi ý —
   *  không tự ghi điểm ở đâu cả. `answerKey` (không bắt buộc): đáp án đúng
   *  của đề, giúp AI so khớp chính xác hơn thay vì tự đoán — nhất là với bài
   *  chưa được chấm tay sẵn. `highRes` (không bắt buộc): gửi ảnh độ phân
   *  giải cao hơn — chỉ dùng cho lượt "Chấm kỹ hơn", tốn phí hơn nên không
   *  bật mặc định. `handwritingNote` (không bắt buộc): ghi chú nét chữ của
   *  ĐÚNG học sinh này — chỉ có khi đã xác định được em (dùng ở "Chấm kỹ hơn"). */
  gradePhoto: (file: File, answerKey?: string, highRes?: boolean, handwritingNote?: string): Promise<AiGradeResult> => {
    const form = new FormData()
    form.append('photo', file)
    if (answerKey?.trim()) form.append('answerKey', answerKey.trim())
    if (highRes) form.append('highRes', 'true')
    if (handwritingNote?.trim()) form.append('handwritingNote', handwritingNote.trim())
    return api
      .post('/ai/grade-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60 * 1000,
      })
      .then((r) => r.data.data)
  },

  /** Gửi 1 ảnh ĐỀ MẪU (không phải bài học sinh) cho AI tự giải ra đáp án —
   *  trả về BẢN NHÁP, cần xem lại/sửa trước khi dùng để chấm cả lớp. */
  solveTest: (file: File): Promise<AiSolveResult> => {
    const form = new FormData()
    form.append('photo', file)
    return api
      .post('/ai/solve-test', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60 * 1000,
      })
      .then((r) => r.data.data)
  },
}
