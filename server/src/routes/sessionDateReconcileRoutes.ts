import { Router } from 'express'
import { previewDateSplitsHandler, runDateSplitsHandler } from '../controllers/sessionDateReconcileController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const sessionDateReconcileRouter = Router()

sessionDateReconcileRouter.use(authenticate)
sessionDateReconcileRouter.use(authorize('admin'))
sessionDateReconcileRouter.get('/preview', previewDateSplitsHandler)
sessionDateReconcileRouter.post('/run', runDateSplitsHandler)
