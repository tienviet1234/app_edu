import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  changePassword,
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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
})

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.' },
})

const forgotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 10 phút.' },
})

export const authRouter = Router()

authRouter.post('/register', registerLimiter, register)
authRouter.post('/login', loginLimiter, login)
authRouter.post('/refresh', refresh)
authRouter.post('/logout', logout)
authRouter.post('/forgot-password', forgotLimiter, forgotPassword)
authRouter.post('/verify-otp', verifyOtp)
authRouter.post('/reset-password', resetPassword)
authRouter.post('/logout-all', authenticate, logoutAll)
authRouter.get('/me', authenticate, asyncHandler(getMe))
authRouter.patch('/me', authenticate, asyncHandler(updateMe))
authRouter.post('/change-password', authenticate, asyncHandler(changePassword))
