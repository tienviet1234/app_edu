import { Router } from 'express'
import { listUsersByRole, getUserByRole, updateUser, listAllUsers } from '../controllers/userController.js'
import { linkChild, unlinkChild, getChildren } from '../controllers/parentController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { objectIdSchema } from '../schemas/commonSchemas.js'
import { z } from 'zod'

export const teacherRouter = Router()
export const studentRouter = Router()
export const parentRouter = Router()
export const userRouter = Router()

teacherRouter.use(authenticate)
teacherRouter.get('/', authorize('teacher'), validate({ query: listQuerySchema }), asyncHandler(listUsersByRole('teacher')))
teacherRouter.get('/:id', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(getUserByRole('teacher')))

studentRouter.use(authenticate)
studentRouter.get('/', authorize('teacher'), validate({ query: listQuerySchema }), asyncHandler(listUsersByRole('student')))
studentRouter.get('/:id', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(getUserByRole('student')))

parentRouter.use(authenticate)
parentRouter.get('/', authorize('teacher'), validate({ query: listQuerySchema }), asyncHandler(listUsersByRole('parent')))
parentRouter.get('/:id', authorize('teacher'), validate({ params: idParamsSchema }), asyncHandler(getUserByRole('parent')))

// Parent self-service: link/unlink/view children
parentRouter.get('/me/children', asyncHandler(getChildren))
parentRouter.post('/me/link-child', validate({ body: z.object({ email: z.string().email() }) }), asyncHandler(linkChild))
parentRouter.delete('/me/unlink-child/:childId', validate({ params: z.object({ childId: objectIdSchema }) }), asyncHandler(unlinkChild))

// General user routes (admin only)
userRouter.use(authenticate)
userRouter.get('/', authorize('admin'), validate({ query: listQuerySchema }), asyncHandler(listAllUsers))
userRouter.patch('/:id', authorize('admin'), validate({ params: idParamsSchema }), asyncHandler(updateUser))
