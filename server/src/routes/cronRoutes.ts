import { Router } from 'express'
import { checkReminders, backupDatabase, cleanupAiPhotos, checkBillingReminders } from '../controllers/cronController.js'

export const cronRouter = Router()

// Không dùng authenticate (GitHub Actions không có JWT) — xác thực bằng x-cron-secret header
cronRouter.post('/check-reminders', checkReminders)
cronRouter.post('/backup-database', backupDatabase)
cronRouter.post('/cleanup-ai-photos', cleanupAiPhotos)
cronRouter.post('/check-billing-reminders', checkBillingReminders)
