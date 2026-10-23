import { Router } from 'express'
import { getSessionHistory, getStudentHistory, restoreScoreVersion } from '../controllers/changeHistoryController.js'
import { authenticate, authorize } from '../middleware/auth.js'

// Lịch sử điểm + khôi phục phiên bản cũ — CHỈ admin.
export const changeHistoryRouter = Router()
changeHistoryRouter.use(authenticate, authorize('admin'))
changeHistoryRouter.get('/sessions/:sessionId', getSessionHistory)
changeHistoryRouter.get('/students/:studentId', getStudentHistory)
changeHistoryRouter.post('/:id/restore', restoreScoreVersion)
