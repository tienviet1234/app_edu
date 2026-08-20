import { Router } from 'express'
import {
  addManagedStudents,
  createClass, deleteClass, enrollStudents, getClass,
  getClassStudents, getJoinCode, joinClass,
  listClasses, removeStudent, updateClass,
} from '../controllers/classController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { classBodySchema, classUpdateSchema } from '../schemas/lmsSchemas.js'
import { z } from 'zod'
import { objectIdSchema } from '../schemas/commonSchemas.js'

export const classRouter = Router()

classRouter.use(authenticate)
classRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listClasses))
classRouter.post('/', authorize('teacher'), validate({ body: classBodySchema }), asyncHandler(createClass))
classRouter.get('/:id', validate({ params: idParamsSchema }), asyncHandler(getClass))
classRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: classUpdateSchema }), asyncHandler(updateClass))
classRouter.delete('/:id', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(deleteClass))

// Enrollment management
classRouter.post(
  '/:id/enroll',
  authorize('teacher'),
  validate({ params: idParamsSchema, body: z.object({ studentIds: z.array(objectIdSchema).min(1) }) }),
  asyncHandler(enrollStudents),
)
classRouter.delete(
  '/:id/students/:studentId',
  authorize('teacher'),
  validate({ params: z.object({ id: objectIdSchema, studentId: objectIdSchema }) }),
  asyncHandler(removeStudent),
)

// Student join a class via join code
classRouter.post(
  '/join',
  validate({ body: z.object({ joinCode: z.string().min(6).max(6) }) }),
  asyncHandler(joinClass),
)

// Get enrolled students list (teacher + admin)
classRouter.get(
  '/:id/students',
  validate({ params: idParamsSchema }),
  asyncHandler(getClassStudents),
)

// Teacher adds students by name — creates managed accounts + enrolls
classRouter.post(
  '/:id/students/bulk',
  authorize('teacher'),
  validate({ params: idParamsSchema, body: z.object({ names: z.array(z.string().min(1)).min(1).max(50) }) }),
  asyncHandler(addManagedStudents),
)

// Get join code for a class (teacher only)
classRouter.get(
  '/:id/join-code',
  authorize('teacher'),
  validate({ params: idParamsSchema }),
  asyncHandler(getJoinCode),
)
