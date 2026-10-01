import type { Request, Response } from 'express'
import multer from 'multer'
import { gradeTestPhoto, solveTestPhoto, gradeSubmissionPhoto, identifyStudentPhoto } from '../services/aiGradingService.js'
import { Notification } from '../models/Notification.js'
import { Class } from '../models/Class.js'
import { AiGradedPhoto } from '../models/AiGradedPhoto.js'
import { uploadImageToCloudinary } from '../services/storageService.js'
import { ok, created, badRequest, forbidden } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'

// Giữ 30 ngày — đủ để đối chiếu nếu phụ huynh thắc mắc điểm, sau đó tự xóa
// (xem aiGradedPhotoService.runAiPhotoCleanup, gọi qua cron hàng ngày) —
// giảm thời gian giữ dữ liệu ảnh trẻ em hơn mức cần thiết.
const AI_PHOTO_RETENTION_DAYS = 30

/** Giáo viên chỉ được lưu/xem ảnh của lớp MÌNH dạy — cùng kiểm tra với
 *  submissionController.assertTeacherOwnsClass. Admin qua hết. */
async function assertTeacherOwnsClass(authReq: AuthRequest, classId: string): Promise<boolean> {
  if (authReq.user?.role === 'admin') return true
  const cls = await Class.findById(classId, 'teacherId').lean()
  return !!cls?.teacherId && String(cls.teacherId) === String(authReq.userId)
}

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

/** POST /api/ai/save-photo — giáo viên CHỦ ĐỘNG lưu lại ảnh bài đã chấm bằng
 *  AI làm bằng chứng/hồ sơ (không tự động, không bắt buộc). Khác hẳn luồng
 *  gradePhoto ở trên — ảnh KHÔNG được lưu trừ khi gọi đúng endpoint này.
 *  Tự xóa sau AI_PHOTO_RETENTION_DAYS (xem aiGradedPhotoService). */
export const savePhoto = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const file = (req as Request & { file?: Express.Multer.File }).file
  const classId = typeof req.body?.classId === 'string' ? req.body.classId : ''
  const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId : ''
  if (!file || !classId || !studentId) {
    badRequest(res, 'Thiếu ảnh, lớp hoặc học sinh.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }

  const { url, publicId } = await uploadImageToCloudinary(file.buffer, 'ai-grade')
  const expiresAt = new Date(Date.now() + AI_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const doc = await AiGradedPhoto.create({
    classId, studentId, uploadedBy: authReq.userId, photoUrl: url, photoPublicId: publicId, expiresAt,
  })
  created(res, { id: doc._id, photoUrl: doc.photoUrl, expiresAt: doc.expiresAt })
})

/** GET /api/ai/saved-photos?classId=&studentId= — xem lại ảnh bài kiểm tra
 *  đã lưu của 1 học sinh. Chỉ giáo viên dạy đúng lớp đó + admin xem được. */
export const listSavedPhotos = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const classId = typeof req.query.classId === 'string' ? req.query.classId : ''
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : ''
  if (!classId || !studentId) {
    badRequest(res, 'Thiếu classId hoặc studentId.')
    return
  }
  if (!(await assertTeacherOwnsClass(authReq, classId))) {
    forbidden(res, 'Bạn không dạy lớp này.')
    return
  }

  const photos = await AiGradedPhoto.find({ classId, studentId }).sort({ createdAt: -1 }).lean()
  ok(res, photos.map((p) => ({ id: p._id, photoUrl: p.photoUrl, expiresAt: p.expiresAt, createdAt: p.createdAt })))
})

/** POST /api/ai/grade-submission — đánh giá sơ bộ 1 ảnh bài tập về nhà đã
 *  nộp qua app (dùng ở SubmissionReviewPanel, KHÁC gradePhoto — bài tập về
 *  nhà không có đáp án cố định). Chỉ trả GỢI Ý — giáo viên phải tự xem lại
 *  và bấm duyệt thật, không có gì được tự động lưu ở endpoint này. Không cần
 *  classId/studentId vì không lưu ảnh lại — chỉ chuyển tiếp ảnh cho AI rồi bỏ. */
export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) {
    badRequest(res, 'Chưa có ảnh nào được gửi lên.')
    return
  }
  const assignmentTitle = typeof req.body?.assignmentTitle === 'string' ? req.body.assignmentTitle.slice(0, 200) : undefined
  const assignmentDescription = typeof req.body?.assignmentDescription === 'string' ? req.body.assignmentDescription.slice(0, 2000) : undefined

  try {
    const result = await gradeSubmissionPhoto(file.buffer, file.mimetype, assignmentTitle, assignmentDescription)
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
        message: 'AI trả về kết quả không đọc được, thử lại.',
      })
      return
    }
    throw err
  }
})

/** POST /api/ai/identify-student — chỉ đọc tên học sinh trên 1 ảnh giấy, KHÔNG
 *  chấm điểm gì — dùng khi giáo viên quét 1 xấp giấy nộp tay (lớp không dùng
 *  điện thoại được) để tự động phân đúng từng em trước khi nộp hộ. Rẻ/nhanh
 *  hơn hẳn grade-photo. */
export const identifyStudent = asyncHandler(async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) {
    badRequest(res, 'Chưa có ảnh nào được gửi lên.')
    return
  }
  try {
    const result = await identifyStudentPhoto(file.buffer, file.mimetype)
    ok(res, result)
  } catch (err) {
    if (err instanceof Error && err.message === 'AI_NOT_CONFIGURED') {
      res.status(503).json({
        success: false,
        message: 'Tính năng AI chưa được bật — thiếu ANTHROPIC_API_KEY trên server.',
      })
      return
    }
    if (err instanceof Error && err.message === 'AI_BAD_RESPONSE') {
      res.status(502).json({
        success: false,
        message: 'AI trả về kết quả không đọc được, thử lại.',
      })
      return
    }
    throw err
  }
})
