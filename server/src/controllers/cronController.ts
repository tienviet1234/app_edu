import type { Request, Response } from 'express'
import { runReminderCheck } from '../services/reminderService.js'
import { runDatabaseBackup } from '../services/backupService.js'
import { ok, unauthorized } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { env } from '../config/env.js'

function checkCronSecret(req: Request): boolean {
  const secret = req.headers['x-cron-secret']
  return !!env.CRON_SECRET && secret === env.CRON_SECRET
}

/** POST /api/cron/check-reminders — gọi bởi GitHub Actions theo lịch, xác thực qua header x-cron-secret */
export const checkReminders = asyncHandler(async (req: Request, res: Response) => {
  if (!checkCronSecret(req)) {
    unauthorized(res, 'Invalid cron secret.')
    return
  }
  const result = await runReminderCheck()
  ok(res, result)
})

/** POST /api/cron/backup-database — sao lưu toàn bộ MongoDB lên R2 theo lịch */
export const backupDatabase = asyncHandler(async (req: Request, res: Response) => {
  if (!checkCronSecret(req)) {
    unauthorized(res, 'Invalid cron secret.')
    return
  }
  const result = await runDatabaseBackup()
  ok(res, result)
})
