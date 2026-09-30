import { Router } from 'express'
import { createDebt, listDebts, submitDebt, clearDebt, rejectDebt, deleteDebt } from '../controllers/debtController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const debtRouter = Router()

debtRouter.use(authenticate)
debtRouter.get('/', listDebts)
// authorize('teacher') đã tự cho phép admin qua (rank hierarchy) — không
// truyền thêm 'admin'.
debtRouter.post('/', authorize('teacher'), createDebt)
debtRouter.post('/:id/submit', submitDebt)
debtRouter.put('/:id/clear', authorize('teacher'), clearDebt)
debtRouter.put('/:id/reject', authorize('teacher'), rejectDebt)
debtRouter.delete('/:id', authorize('teacher'), deleteDebt)
