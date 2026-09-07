import type { Request, Response } from 'express'
import { runReminderCheck } from '../services/reminderService.js'
import { ok, unauthorized } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { env } from '../config/env.js'

/** POST /api/cron/check-reminders — gọi bởi GitHub Actions theo lịch, xác thực qua header x-cron-secret */
export const checkReminders = asyncHandler(async (req: Request, res: Response) => {
  const secret = req.headers['x-cron-secret']
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    unauthorized(res, 'Invalid cron secret.')
    return
  }
  const result = await runReminderCheck()
  ok(res, result)
})
