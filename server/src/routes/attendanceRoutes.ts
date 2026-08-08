import { Router } from 'express'
import { listAttendance, updateAttendance, upsertAttendance } from '../controllers/attendanceController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { attendanceBodySchema, attendanceUpdateSchema } from '../schemas/lmsSchemas.js'

export const attendanceRouter = Router()

attendanceRouter.use(authenticate)
attendanceRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listAttendance))
attendanceRouter.post('/', authorize('teacher'), validate({ body: attendanceBodySchema }), asyncHandler(upsertAttendance))
attendanceRouter.patch('/:id', authorize('teacher'), validate({ params: idParamsSchema, body: attendanceUpdateSchema }), asyncHandler(updateAttendance))
