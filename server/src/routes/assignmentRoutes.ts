import { Router } from 'express'
import {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignmentStats,
} from '../controllers/assignmentController.js'
import { authenticate, authorize } from '../middleware/auth.js'

export const assignmentRouter = Router()

assignmentRouter.use(authenticate)

assignmentRouter.get('/', listAssignments)
assignmentRouter.get('/:id', getAssignment)
assignmentRouter.get('/:id/stats', getAssignmentStats)
assignmentRouter.post('/', authorize('teacher'), createAssignment)
assignmentRouter.put('/:id', authorize('teacher'), updateAssignment)
assignmentRouter.delete('/:id', authorize('teacher'), deleteAssignment)
