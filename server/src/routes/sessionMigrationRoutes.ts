import { Router } from 'express'
import { previewSessionMigrationHandler, runSessionMigrationHandler } from '../controllers/sessionMigrationController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const sessionMigrationRouter = Router()

// Chỉ admin — thao tác này ghi/đổi cấu trúc dữ liệu buổi học thật của cả
// trung tâm, không phải việc giáo viên thường làm.
sessionMigrationRouter.use(authenticate)
sessionMigrationRouter.use(authorize('admin'))
sessionMigrationRouter.get('/preview', previewSessionMigrationHandler)
sessionMigrationRouter.post('/run', runSessionMigrationHandler)
