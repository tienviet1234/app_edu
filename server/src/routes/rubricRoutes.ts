import { Router } from 'express'
import { createRubric, getRubric, listRubrics, updateRubric } from '../controllers/rubricController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { rubricBodySchema, rubricUpdateSchema } from '../schemas/lmsSchemas.js'

export const rubricRouter = Router()

rubricRouter.use(authenticate)
rubricRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listRubrics))
rubricRouter.post('/', authorize('teacher'), validate({ body: rubricBodySchema }), asyncHandler(createRubric))
rubricRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getRubric))
rubricRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: rubricUpdateSchema }), asyncHandler(updateRubric))
