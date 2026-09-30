import type { Request, Response } from 'express'
import multer from 'multer'
import { gradeTestPhoto, solveTestPhoto } from '../services/aiGradingService.js'
import { Notification } from '../models/Notification.js'
import { ok, badRequest } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

// Multer: lưu tạm trong memory (không ghi ổ đĩa, không upload lên đâu cả).
// Nhận cả ẢNH (jpeg/png/webp) LẪN FILE PDF (VD chụp màn hình đề từ file PDF,
// hoặc chính file PDF gốc) — Claude đọc PDF trực tiếp, không cần tự chuyển
// từng trang sang ảnh. Giới hạn 15MB — PDF nhiều trang/scan nặng hơn ảnh.
export const uploadAiPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype))
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

  // Đáp án đúng của đề — giáo viên tự gõ, không bắt buộc (multer đưa field
  // text thường của multipart/form-data vào req.body).
  const answerKey = typeof req.body?.answerKey === 'string' ? req.body.answerKey.slice(0, 4000) : undefined
  // Chỉ true khi giáo viên chủ động bấm "Chấm kỹ hơn" cho 1 ảnh cụ thể —
  // không phải mặc định, vì độ phân giải cao hơn tốn phí hơn.
  const highRes = req.body?.highRes === 'true'
  // Ghi chú nét chữ của học sinh đã xác định — chỉ có ở lượt "Chấm kỹ hơn".
  const handwritingNote = typeof req.body?.handwritingNote === 'string' ? req.body.handwritingNote.slice(0, 300) : undefined

  try {
    const result = await gradeTestPhoto(file.buffer, file.mimetype, answerKey, highRes, handwritingNote)
    // Chữ quá xấu/ảnh quá mờ, AI không đọc được gì — không chỉ hiện tạm trên
    // màn hình đang mở, mà còn gửi thông báo thật vào chuông 🔔 của giáo
    // viên, để họ biết dù không còn đang mở đúng màn "Chấm bằng AI" lúc đó.
    if (result.unreadable) {
      const authReq = req as AuthRequest
      if (authReq.userId) {
        await Notification.create({
          recipientId: authReq.userId,
          title: 'AI không đọc được 1 ảnh bài kiểm tra',
          body: `Ảnh "${file.originalname || 'bài chấm'}" quá mờ hoặc chữ quá khó đọc — AI không chấm được. Vào "Chấm bằng AI" để xem lại và chấm tay ảnh này.`,
          type: 'system',
          createdBy: authReq.userId,
        }).catch((err) => console.error('Lỗi tạo thông báo AI không đọc được ảnh:', err))
      }
    }
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

/** POST /api/ai/solve-test — AI tự giải 1 ảnh ĐỀ MẪU (không phải bài học
 *  sinh) ra đáp án đúng. Trả về BẢN NHÁP — giáo viên phải xem lại/sửa trước
 *  khi dùng để chấm cả lớp, endpoint này không tự lưu gì cả. */
export const solveTest = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) {
    badRequest(res, 'Chưa có ảnh nào được gửi lên.')
    return
  }

  try {
    const result = await solveTestPhoto(file.buffer, file.mimetype)
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
        message: 'AI trả về kết quả không đọc được, thử chụp lại ảnh đề rõ hơn.',
      })
      return
    }
    throw err
  }
})
