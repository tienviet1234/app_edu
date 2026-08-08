import { Router } from 'express'
import { listUploads, registerUpload } from '../controllers/uploadController.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { listQuerySchema } from '../schemas/commonSchemas.js'
import { uploadBodySchema } from '../schemas/lmsSchemas.js'

export const uploadRouter = Router()

uploadRouter.use(authenticate)
uploadRouter.get('/', validate({ query: listQuerySchema }), asyncHandler(listUploads))
uploadRouter.post('/', validate({ body: uploadBodySchema }), asyncHandler(registerUpload))
