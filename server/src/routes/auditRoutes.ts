import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { listAuditLogs, logActivity } from '../controllers/auditController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const auditRouter = Router()

const logLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu ghi log. Vui lòng thử lại sau.' },
})

// Any authenticated user can log frontend activities (rate-limited)
auditRouter.post('/', logLimiter, authenticate, asyncHandler(logActivity))

// Only admins can read the audit log
auditRouter.get('/', authenticate, authorize('admin'), asyncHandler(listAuditLogs))
