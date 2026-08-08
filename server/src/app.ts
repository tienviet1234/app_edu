import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { env } from './config/env.js'
import { authRouter } from './routes/authRoutes.js'
import { analyticsRouter } from './routes/analyticsRoutes.js'
import { attendanceRouter } from './routes/attendanceRoutes.js'
import { auditRouter } from './routes/auditRoutes.js'
import { courseRouter } from './routes/courseRoutes.js'
import { notificationRouter } from './routes/notificationRoutes.js'
import { parentRouter, studentRouter, teacherRouter, userRouter } from './routes/userRoutes.js'
import { reportRouter } from './routes/reportRoutes.js'
import { rubricRouter } from './routes/rubricRoutes.js'
import { sessionRouter } from './routes/sessionRoutes.js'
import { uploadRouter } from './routes/uploadRoutes.js'
import { classRouter } from './routes/classRoutes.js'
import { lessonRouter } from './routes/lessonRoutes.js'
import { pushRouter } from './routes/pushRoutes.js'
import { scoreRouter } from './routes/scoreRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './utils/response.js'

export const app = express()

app.set('trust proxy', 1)

app.use(helmet())
const allowedOrigins = env.CLIENT_ORIGIN.split(',').map((o) => o.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
}))

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } })
})

app.use('/api/auth', authRouter)
app.use('/api/teachers', teacherRouter)
app.use('/api/students', studentRouter)
app.use('/api/parents', parentRouter)
app.use('/api/courses', courseRouter)
app.use('/api/sessions', sessionRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api/rubrics', rubricRouter)
app.use('/api/reports', reportRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/notifications', notificationRouter)
app.use('/api/uploads', uploadRouter)
app.use('/api/audit-logs', auditRouter)
app.use('/api/classes', classRouter)
app.use('/api/lessons', lessonRouter)
app.use('/api/scores', scoreRouter)
app.use('/api/users', userRouter)
app.use('/api/push', pushRouter)

app.use((_req, res) => {
  notFound(res, 'Route not found.')
})

app.use(errorHandler)
