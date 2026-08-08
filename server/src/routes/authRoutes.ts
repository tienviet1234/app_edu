import { Router } from 'express'
import {
  forgotPassword,
  getMe,
  login,
  logout,
  logoutAll,
  refresh,
  register,
  resetPassword,
  updateMe,
  verifyOtp,
} from '../controllers/authController.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'

export const authRouter = Router()

authRouter.post('/register', register)
authRouter.post('/login', login)
authRouter.post('/refresh', refresh)
authRouter.post('/logout', logout)
authRouter.post('/forgot-password', forgotPassword)
authRouter.post('/verify-otp', verifyOtp)
authRouter.post('/reset-password', resetPassword)
authRouter.post('/logout-all', authenticate, logoutAll)
authRouter.get('/me', authenticate, asyncHandler(getMe))
authRouter.patch('/me', authenticate, asyncHandler(updateMe))
