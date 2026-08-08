import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { UploadAsset } from '../models/UploadAsset.js'
import { created, ok } from '../utils/response.js'
import { paginate } from '../utils/pagination.js'
import type { AuthRequest } from '../middleware/auth.js'
import { writeAudit } from '../services/auditService.js'

export async function listUploads(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const filter = {
    ...(authReq.user?.role === 'admin' ? {} : { ownerId: authReq.userId }),
    ...(req.query.scope ? { scope: req.query.scope } : {}),
  }
  ok(res, await paginate(UploadAsset, filter, req.query))
}

export async function registerUpload(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const asset = await UploadAsset.create({
    ...req.body,
    ownerId: new Types.ObjectId(authReq.userId),
  })
  await writeAudit(req, { action: 'upload.register', resource: 'UploadAsset', resourceId: String(asset._id) })
  created(res, asset)
}
