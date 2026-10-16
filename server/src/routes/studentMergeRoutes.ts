import { Router } from 'express'
import { searchStudentsForMerge, previewStudentMergeHandler, runStudentMergeHandler } from '../controllers/studentMergeController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const studentMergeRouter = Router()

// Giáo viên + admin — authorize('teacher') đã tự cho phép admin qua rank
// hierarchy (xem gotcha CLAUDE.md). Giới hạn trong lớp mình dạy được kiểm
// tra riêng trong controller (assertCanTouchClass), không chặn ở đây.
studentMergeRouter.use(authenticate)
studentMergeRouter.use(authorize('teacher'))
studentMergeRouter.get('/search', searchStudentsForMerge)
studentMergeRouter.get('/preview', previewStudentMergeHandler)
studentMergeRouter.post('/', runStudentMergeHandler)
