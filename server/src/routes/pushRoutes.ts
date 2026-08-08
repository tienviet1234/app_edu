import { Router } from 'express'
import { getVapidPublicKey, subscribe, unsubscribe } from '../controllers/pushController.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const pushRouter = Router()

pushRouter.get('/vapid-public-key', asyncHandler(getVapidPublicKey))
pushRouter.post('/subscribe', authenticate, asyncHandler(subscribe))
pushRouter.delete('/subscribe', authenticate, asyncHandler(unsubscribe))
