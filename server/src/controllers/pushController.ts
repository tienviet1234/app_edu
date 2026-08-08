import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { PushSubscription } from '../models/PushSubscription.js'
import { ok, created } from '../utils/response.js'
import type { AuthRequest } from '../middleware/auth.js'
import { env } from '../config/env.js'

export async function getVapidPublicKey(_req: Request, res: Response): Promise<void> {
  ok(res, { publicKey: env.VAPID_PUBLIC_KEY })
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const authReq = req as AuthRequest
  const { endpoint, keys, userAgent } = req.body as {
    endpoint: string
    keys: { p256dh: string; auth: string }
    userAgent?: string
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: new Types.ObjectId(authReq.userId), endpoint, keys, userAgent },
    { upsert: true, new: true },
  )
  created(res, { subscribed: true })
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const { endpoint } = req.body as { endpoint: string }
  await PushSubscription.deleteOne({ endpoint })
  ok(res, { unsubscribed: true })
}
