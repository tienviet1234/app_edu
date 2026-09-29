import type { Request, Response } from 'express'
import multer from 'multer'
import { gradeTestPhoto } from '../services/aiGradingService.js'
import { ok, badRequest } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'

// Multer: lưu tạm trong memory (không ghi ổ đĩa, không upload lên đâu cả),
// giới hạn 8MB — chỉ để OCR/chấm, không cần ảnh gốc chất lượng cao.
export const uploadAiPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
  },
})

/** POST /api/ai/grade-photo — đọc tên + chấm điểm 1 ảnh bài kiểm tra giấy.
 *  Chỉ trả gợi ý, KHÔNG tự ghi điểm vào đâu — frontend tự đối chiếu tên với
 *  danh sách học sinh đang có trên máy rồi mới cho giáo viên xác nhận lưu. */
export const gradePhoto = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) {
    badRequest(res, 'Chưa có ảnh nào được gửi lên.')
    return
  }

  try {
    const result = await gradeTestPhoto(file.buffer, file.mimetype)
    ok(res, result)
  } catch (err) {
    if (err instanceof Error && err.message === 'AI_NOT_CONFIGURED') {
      res.status(503).json({
        success: false,
        message: 'Tính năng chấm điểm bằng AI chưa được bật — thiếu ANTHROPIC_API_KEY trên server.',
      })
      return
    }
    if (err instanceof Error && err.message === 'AI_BAD_RESPONSE') {
      res.status(502).json({
        success: false,
        message: 'AI trả về kết quả không đọc được, thử chụp lại ảnh rõ hơn.',
      })
      return
    }
    throw err
  }
})
