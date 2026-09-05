import { Router } from 'express'
import {
  listSubmissions,
  createSubmission,
  getVideoUrl,
  reviewSubmission,
  deleteSubmission,
  upload,
} from '../controllers/submissionController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const submissionRouter = Router()

submissionRouter.use(authenticate)

submissionRouter.get('/', listSubmissions)
submissionRouter.post('/', upload.array('files', 4), createSubmission)
submissionRouter.get('/:id/video-url', getVideoUrl)
submissionRouter.put('/:id/review', authorize('teacher'), reviewSubmission)
submissionRouter.delete('/:id', deleteSubmission)
