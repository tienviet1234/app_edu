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
  ambiguousItems: Array<{ description: string; suggestions: string[]; position: { x: number; y: number } }>
}

export interface AiSolveResult {
  lines: Array<{ text: string; uncertain: boolean; note: string }>
  lowConfidence: boolean
  unreadable: boolean
}

export interface AiSavedPhoto {
  id: string
  photoUrl: string
  expiresAt: string
  createdAt: string
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

  /** Giáo viên CHỦ ĐỘNG lưu lại ảnh bài đã chấm làm bằng chứng/hồ sơ — KHÁC
   *  hẳn gradePhoto ở trên, ảnh KHÔNG được lưu trừ khi gọi đúng hàm này. Tự
   *  xóa sau 30 ngày, chỉ giáo viên dạy lớp đó + admin xem lại được. */
  savePhoto: (file: File, classId: string, studentId: string): Promise<AiSavedPhoto> => {
    const form = new FormData()
    form.append('photo', file)
    form.append('classId', classId)
    form.append('studentId', studentId)
    return api
      .post('/ai/save-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60 * 1000,
      })
      .then((r) => r.data.data)
  },

  /** Xem lại ảnh bài kiểm tra đã lưu của 1 học sinh (mới nhất trước). */
  listSavedPhotos: (classId: string, studentId: string): Promise<AiSavedPhoto[]> =>
    api.get('/ai/saved-photos', { params: { classId, studentId } }).then((r) => r.data.data),
}
