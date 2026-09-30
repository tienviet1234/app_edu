import { api } from '@/utils/api'

export interface AiGradeResult {
  studentName: string
  rawScore: number
  rawMax: number
  errors: string[]
  lowConfidence: boolean
  unreadable: boolean
  fromExistingGrade: boolean
}

export const aiGradingService = {
  /** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Chỉ trả gợi ý —
   *  không tự ghi điểm ở đâu cả. `answerKey` (không bắt buộc): đáp án đúng
   *  của đề, giúp AI so khớp chính xác hơn thay vì tự đoán — nhất là với bài
   *  chưa được chấm tay sẵn. */
  gradePhoto: (file: File, answerKey?: string): Promise<AiGradeResult> => {
    const form = new FormData()
    form.append('photo', file)
    if (answerKey?.trim()) form.append('answerKey', answerKey.trim())
    return api
      .post('/ai/grade-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60 * 1000,
      })
      .then((r) => r.data.data)
  },
}
