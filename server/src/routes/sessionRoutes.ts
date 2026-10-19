import { Router } from 'express'
import { batchRenumberSessions, completeSession, createSession, deleteSession, getSession, listSessions, restoreSession, updateSession } from '../controllers/sessionController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { sessionBodySchema, sessionUpdateSchema, sessionRenumberBodySchema } from '../schemas/lmsSchemas.js'

export const sessionRouter = Router()

sessionRouter.use(authenticate)
sessionRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listSessions))
sessionRouter.post('/', authorize('teacher'), validate({ body: sessionBodySchema }), asyncHandler(createSession))
// Đặt TRƯỚC '/:id' — path tĩnh, nếu để sau sẽ bị Express khớp nhầm thành id.
sessionRouter.post('/batch-renumber', authorize('teacher'), validate({ body: sessionRenumberBodySchema }), asyncHandler(batchRenumberSessions))
sessionRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getSession))
sessionRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: sessionUpdateSchema }), asyncHandler(updateSession))
sessionRouter.post('/:id/complete', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(completeSession))
sessionRouter.delete('/:id', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(deleteSession))
sessionRouter.post('/:id/restore', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(restoreSession))
