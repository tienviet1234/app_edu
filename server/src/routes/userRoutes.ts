import { Router } from 'express'
import { listUsersByRole, getUserByRole, updateUser, listAllUsers } from '../controllers/userController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'

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

// General user routes (admin only)
userRouter.use(authenticate)
userRouter.get('/', authorize('admin'), validate({ query: listQuerySchema }), asyncHandler(listAllUsers))
userRouter.patch('/:id', authorize('admin'), validate({ params: idParamsSchema }), asyncHandler(updateUser))
