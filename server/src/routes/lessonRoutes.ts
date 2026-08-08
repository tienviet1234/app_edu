import { Router } from 'express'
import { createLesson, deleteLesson, getLesson, listLessons, updateLesson } from '../controllers/lessonController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { lessonBodySchema, lessonUpdateSchema } from '../schemas/lmsSchemas.js'

export const lessonRouter = Router()

lessonRouter.use(authenticate)
lessonRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listLessons))
lessonRouter.post('/', authorize('teacher'), validate({ body: lessonBodySchema }), asyncHandler(createLesson))
lessonRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getLesson))
lessonRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: lessonUpdateSchema }), asyncHandler(updateLesson))
lessonRouter.delete('/:id', authorize('admin'), validate({ params: idParamsSchema }), asyncHandler(deleteLesson))
