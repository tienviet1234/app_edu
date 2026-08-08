import { Router } from 'express'
import { getScore, listScores, sessionSummary, updateScore, upsertScore } from '../controllers/scoreController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema, objectIdSchema } from '../schemas/commonSchemas.js'
import { scoreBodySchema, scoreUpdateSchema } from '../schemas/lmsSchemas.js'
import { z } from 'zod'

export const scoreRouter = Router()

scoreRouter.use(authenticate)
scoreRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listScores))
scoreRouter.post('/upsert', authorize('teacher'), validate({ body: scoreBodySchema }), asyncHandler(upsertScore))
scoreRouter.get('/session/:sessionId/summary', validate({ params: z.object({ sessionId: objectIdSchema }) }), asyncHandler(sessionSummary))
scoreRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getScore))
scoreRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: scoreUpdateSchema }), asyncHandler(updateScore))
