import { Router } from 'express'
import {
  getAnalyticsOverview,
  getAttendanceTrend,
  getScoreHeatmap,
  getTeacherPerformance,
} from '../controllers/analyticsController.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const analyticsRouter = Router()

analyticsRouter.use(authenticate)
analyticsRouter.get('/overview',             authorize('teacher'), asyncHandler(getAnalyticsOverview))
analyticsRouter.get('/attendance-trend',     authorize('teacher'), asyncHandler(getAttendanceTrend))
analyticsRouter.get('/score-heatmap',        authorize('teacher'), asyncHandler(getScoreHeatmap))
analyticsRouter.get('/teacher-performance',  authorize('admin'),   asyncHandler(getTeacherPerformance))
