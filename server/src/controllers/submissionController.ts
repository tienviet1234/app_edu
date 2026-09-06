import type { Request, Response } from 'express'
import multer from 'multer'
import { Types } from 'mongoose'
import { Submission } from '../models/Submission.js'
import { Assignment } from '../models/Assignment.js'
import {
  uploadImageToCloudinary,
  uploadVideoToR2,
  getVideoPresignedUrl,
  deleteImageFromCloudinary,
  deleteVideoFromR2,
  makeVideoKey,
} from '../services/storageService.js'
import { ok, created } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import type { AuthRequest } from '../middleware/auth.js'
import { gradeQuiz } from '../services/quizGrading.js'

// Multer: lưu trong memory, giới hạn 80MB (video đã nén 360p/5 phút)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
    cb(null, allowed.includes(file.mimetype))
  },
})

/** GET /api/submissions?assignmentId=&studentId= */
export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {}
  if (req.query.assignmentId) filter.assignmentId = req.query.assignmentId
  if (req.query.studentId) filter.studentId = req.query.studentId
  if (req.query.classId) filter.classId = req.query.classId

  const items = await Submission.find(filter)
    .sort({ createdAt: -1 })
    .populate('studentId', 'name')
    .lean()

  // Không trả videoKey ra ngoài — client phải xin presigned URL riêng
  const sanitized = items.map(({ videoKey: _vk, ...rest }) => rest)
  ok(res, sanitized)
})

/** POST /api/submissions  — multipart/form-data */
export const createSubmission = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { assignmentId, studentId, classId } = req.body

  if (!assignmentId || !studentId || !classId) {
    res.status(400).json({ success: false, message: 'Thiếu assignmentId / studentId / classId' })
    return
  }

  const assignment = await Assignment.findById(assignmentId)
  if (!assignment || !assignment.isActive) {
    res.status(404).json({ success: false, message: 'Bài tập không tồn tại' })
    return
  }

  const files = req.files as Express.Multer.File[] | undefined
  const photoFiles = files?.filter((f) => f.mimetype.startsWith('image/')) ?? []
  const videoFile  = files?.find((f) => f.mimetype.startsWith('video/'))

  // Upload ảnh lên Cloudinary song song
  const photos = await Promise.all(
    photoFiles.slice(0, assignment.maxPhotos).map((f) =>
      uploadImageToCloudinary(f.buffer, `homework/${classId}`),
    ),
  )

  // Upload video lên R2
  let videoKey: string | undefined
  let videoMimeType: string | undefined
  if (videoFile) {
    const tempId = new Types.ObjectId().toString()
    const key = makeVideoKey(tempId, videoFile.originalname)
    await uploadVideoToR2(videoFile.buffer, key, videoFile.mimetype)
    videoKey = key
    videoMimeType = videoFile.mimetype
  }

  const submission = await Submission.findOneAndUpdate(
    { assignmentId, studentId },
    {
      assignmentId,
      classId,
      studentId,
      submittedBy: authReq.userId,
      photos: photos.map((p) => ({ url: p.url, publicId: p.publicId })),
      ...(videoKey ? { videoKey, videoMimeType } : {}),
      status: 'submitted',
      teacherComment: undefined,
      teacherScore: undefined,
      reviewedAt: undefined,
      reviewedBy: undefined,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const { videoKey: _vk, ...safe } = submission.toObject()
  created(res, safe)
})

/** POST /api/submissions/quiz — nộp bài quiz (JSON), tự động chấm điểm ngay */
export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { assignmentId, studentId, classId, answers: rawAnswers } = req.body as {
    assignmentId?: string
    studentId?: string
    classId?: string
    answers?: Record<string, unknown>
  }

  if (!assignmentId || !studentId || !classId || !rawAnswers) {
    res.status(400).json({ success: false, message: 'Thiếu assignmentId / studentId / classId / answers' })
    return
  }

  const assignment = await Assignment.findById(assignmentId)
  if (!assignment || !assignment.isActive) {
    res.status(404).json({ success: false, message: 'Bài tập không tồn tại' })
    return
  }
  if (assignment.submitType !== 'quiz' || !assignment.questions?.length) {
    res.status(400).json({ success: false, message: 'Bài tập này không phải dạng quiz' })
    return
  }

  const { answers, score } = gradeQuiz(assignment.questions, rawAnswers)

  const submission = await Submission.findOneAndUpdate(
    { assignmentId, studentId },
    {
      assignmentId,
      classId,
      studentId,
      submittedBy: authReq.userId,
      answers,
      autoScore: score,
      status: 'reviewed', // tự chấm xong, không cần giáo viên duyệt tay
      reviewedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  const { videoKey: _vk, ...safe } = submission.toObject()
  created(res, safe)
})

/** GET /api/submissions/:id/video-url — presigned URL xem video (hết hạn 1 giờ) */
export const getVideoUrl = asyncHandler(async (req: Request, res: Response) => {
  const submission = await Submission.findById(req.params.id).select('videoKey studentId classId').lean()
  if (!submission || !submission.videoKey) {
    res.status(404).json({ success: false, message: 'Không có video' })
    return
  }
  const url = await getVideoPresignedUrl(submission.videoKey)
  ok(res, { url })
})

/** PUT /api/submissions/:id/review — giáo viên duyệt bài */
export const reviewSubmission = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const { teacherComment, teacherScore } = req.body

  const submission = await Submission.findByIdAndUpdate(
    req.params.id,
    {
      status: 'reviewed',
      teacherComment,
      teacherScore,
      reviewedAt: new Date(),
      reviewedBy: authReq.userId,
    },
    { new: true },
  ).lean()

  if (!submission) {
    res.status(404).json({ success: false, message: 'Không tìm thấy bài nộp' })
    return
  }

  const { videoKey: _vk, ...safe } = submission
  ok(res, safe)
})

/** DELETE /api/submissions/:id — xóa bài nộp + file trên storage */
export const deleteSubmission = asyncHandler(async (req: Request, res: Response) => {
  const submission = await Submission.findById(req.params.id)
  if (!submission) { res.status(404).json({ success: false, message: 'Không tìm thấy' }); return }

  // Xóa ảnh trên Cloudinary
  await Promise.allSettled(submission.photos.map((p) => deleteImageFromCloudinary(p.publicId)))

  // Xóa video trên R2
  if (submission.videoKey) await deleteVideoFromR2(submission.videoKey).catch(() => null)

  await submission.deleteOne()
  res.status(204).send()
})
