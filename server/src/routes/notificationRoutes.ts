import { Router } from 'express'
import { broadcastToClass, createNotification, getUnreadCount, listNotifications, markAllRead, markNotificationRead } from '../controllers/notificationController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { idParamsSchema, listQuerySchema } from '../schemas/commonSchemas.js'
import { broadcastBodySchema, notificationBodySchema } from '../schemas/lmsSchemas.js'

export const notificationRouter = Router()

notificationRouter.use(authenticate)
notificationRouter.get('/unread-count', asyncHandler(getUnreadCount))
notificationRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listNotifications))
notificationRouter.post('/', authorize('teacher'), validate({ body: notificationBodySchema }), asyncHandler(createNotification))
notificationRouter.post('/broadcast', authorize('teacher'), validate({ body: broadcastBodySchema }), asyncHandler(broadcastToClass))
notificationRouter.post('/read-all', asyncHandler(markAllRead))
notificationRouter.post('/:id/read', validate({ params: idParamsSchema }), asyncHandler(markNotificationRead))
