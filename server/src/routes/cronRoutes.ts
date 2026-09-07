import { Router } from 'express'
import { checkReminders } from '../controllers/cronController.js'

export const cronRouter = Router()

// Không dùng authenticate (GitHub Actions không có JWT) — xác thực bằng x-cron-secret header
cronRouter.post('/check-reminders', checkReminders)
