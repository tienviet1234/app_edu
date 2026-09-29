import { api } from '@/utils/api'

export interface AiGradeResult {
  studentName: string
  rawScore: number
  rawMax: number
  errors: string[]
  lowConfidence: boolean
  unreadable: boolean
}

export const aiGradingService = {
  /** Gửi 1 ảnh bài kiểm tra giấy cho AI đọc tên + chấm điểm. Chỉ trả gợi ý —
   *  không tự ghi điểm ở đâu cả. */
  gradePhoto: (file: File): Promise<AiGradeResult> => {
    const form = new FormData()
    form.append('photo', file)
    return api
      .post('/ai/grade-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60 * 1000,
      })
      .then((r) => r.data.data)
  },
}
