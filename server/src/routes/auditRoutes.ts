import { Router } from 'express'
import { listAuditLogs } from '../controllers/auditController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { listQuerySchema } from '../schemas/commonSchemas.js'

export const auditRouter = Router()

auditRouter.use(authenticate, authorize('admin'))
auditRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listAuditLogs))
