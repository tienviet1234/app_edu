import { Router } from 'express'
import { completeSession, createSession, getSession, listSessions, updateSession } from '../controllers/sessionController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { sessionBodySchema, sessionUpdateSchema } from '../schemas/lmsSchemas.js'

export const sessionRouter = Router()

sessionRouter.use(authenticate)
sessionRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listSessions))
sessionRouter.post('/', authorize('teacher'), validate({ body: sessionBodySchema }), asyncHandler(createSession))
sessionRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getSession))
sessionRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: sessionUpdateSchema }), asyncHandler(updateSession))
sessionRouter.post('/:id/complete', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(completeSession))
