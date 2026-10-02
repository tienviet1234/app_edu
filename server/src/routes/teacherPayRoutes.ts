import { Router } from 'express'
import { markTeacherPaid, listTeacherPay, deleteTeacherPay } from '../controllers/teacherPayController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const teacherPayRouter = Router()

teacherPayRouter.use(authenticate)
// CHỈ admin — đây là hồ sơ nội bộ xác nhận đã trả lương, giáo viên (kể cả
// chủ nhiệm lớp) không có quyền tự đánh dấu cho chính mình.
teacherPayRouter.use(authorize('admin'))
teacherPayRouter.get('/', listTeacherPay)
teacherPayRouter.post('/', markTeacherPaid)
teacherPayRouter.delete('/:id', deleteTeacherPay)
