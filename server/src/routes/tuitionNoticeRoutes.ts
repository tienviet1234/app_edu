import { Router } from 'express'
import {
  createTuitionNotice, listTuitionNotices, deleteTuitionNotice, markTuitionPaid, markTuitionUnpaid,
  getTuitionNoticeSummary,
} from '../controllers/tuitionNoticeController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const tuitionNoticeRouter = Router()

tuitionNoticeRouter.use(authenticate)
// authorize('teacher') đã tự cho phép admin qua (rank hierarchy) — không
// truyền thêm 'admin'.
// /summary khai báo TRƯỚC '/' để rõ ràng không lẫn với route khác.
tuitionNoticeRouter.get('/summary', authorize('teacher'), getTuitionNoticeSummary)
tuitionNoticeRouter.get('/', authorize('teacher'), listTuitionNotices)
tuitionNoticeRouter.post('/', authorize('teacher'), createTuitionNotice)
tuitionNoticeRouter.put('/:id/paid', authorize('teacher'), markTuitionPaid)
tuitionNoticeRouter.put('/:id/unpaid', authorize('teacher'), markTuitionUnpaid)
tuitionNoticeRouter.delete('/:id', authorize('teacher'), deleteTuitionNotice)
