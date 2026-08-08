import { Router } from 'express'
import { createReport, getReport, listReports, publishReport, updateReport, upsertReport } from '../controllers/reportController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { reportBodySchema, reportUpdateSchema } from '../schemas/lmsSchemas.js'

export const reportRouter = Router()

reportRouter.use(authenticate)
reportRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listReports))
reportRouter.post('/upsert', authorize('teacher'), validate({ body: reportBodySchema }), asyncHandler(upsertReport))
reportRouter.post('/', authorize('teacher'), validate({ body: reportBodySchema }), asyncHandler(createReport))
reportRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getReport))
reportRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: reportUpdateSchema }), asyncHandler(updateReport))
reportRouter.post('/:id/publish', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(publishReport))
