import express, { Router } from 'express'
import { postClientSnapshot, getBackups, downloadBackup, runBackupNow } from '../controllers/backupController.js'
import { authenticate, authorize } from '../middleware/auth.js'

// Bản chụp có thể lớn hơn giới hạn 2MB chung — route này tự parse JSON với
// giới hạn riêng, phải mount TRƯỚC express.json() toàn cục ở app.ts.
export const clientSnapshotRouter = Router()
clientSnapshotRouter.use(express.json({ limit: '25mb' }))
clientSnapshotRouter.use(authenticate)
clientSnapshotRouter.use(authorize('teacher'))
clientSnapshotRouter.post('/', postClientSnapshot)

export const adminBackupRouter = Router()
adminBackupRouter.use(authenticate)
adminBackupRouter.use(authorize('admin'))
adminBackupRouter.get('/', getBackups)
adminBackupRouter.get('/download', downloadBackup)
adminBackupRouter.post('/run', runBackupNow)
