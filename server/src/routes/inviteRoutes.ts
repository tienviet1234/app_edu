import { Router } from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { createInvite, listInvites, revokeInvite } from '../controllers/inviteController.js'

export const inviteRouter = Router()

inviteRouter.use(authenticate, authorize('admin'))

inviteRouter.post('/', asyncHandler(createInvite))
inviteRouter.get('/', asyncHandler(listInvites))
inviteRouter.delete('/:id', asyncHandler(revokeInvite))
