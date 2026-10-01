import { Router } from 'express'
import {
  createTuitionNotice, listTuitionNotices, deleteTuitionNotice, markTuitionPaid, markTuitionUnpaid,
} from '../controllers/tuitionNoticeController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const tuitionNoticeRouter = Router()

tuitionNoticeRouter.use(authenticate)
// authorize('teacher') đã tự cho phép admin qua (rank hierarchy) — không
// truyền thêm 'admin'.
tuitionNoticeRouter.get('/', authorize('teacher'), listTuitionNotices)
tuitionNoticeRouter.post('/', authorize('teacher'), createTuitionNotice)
tuitionNoticeRouter.put('/:id/paid', authorize('teacher'), markTuitionPaid)
tuitionNoticeRouter.put('/:id/unpaid', authorize('teacher'), markTuitionUnpaid)
tuitionNoticeRouter.delete('/:id', authorize('teacher'), deleteTuitionNotice)
