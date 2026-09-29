import { Router } from 'express'
import { gradePhoto, uploadAiPhoto } from '../controllers/aiGradingController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const aiRouter = Router()

aiRouter.use(authenticate)
// authorize('teacher') đã tự cho phép admin qua (rank hierarchy) — không
// truyền thêm 'admin'.
aiRouter.post('/grade-photo', authorize('teacher'), uploadAiPhoto.single('photo'), gradePhoto)
