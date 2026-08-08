import { Router } from 'express'
import { archiveCourse, createCourse, getCourse, listCourses, updateCourse } from '../controllers/courseController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { courseBodySchema, courseUpdateSchema } from '../schemas/lmsSchemas.js'

export const courseRouter = Router()

courseRouter.use(authenticate)
courseRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listCourses))
courseRouter.post('/', authorize('teacher'), validate({ body: courseBodySchema }), asyncHandler(createCourse))
courseRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getCourse))
courseRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: courseUpdateSchema }), asyncHandler(updateCourse))
courseRouter.delete('/:id', authorize('admin'), validate({ params: idParamsSchema }), asyncHandler(archiveCourse))
