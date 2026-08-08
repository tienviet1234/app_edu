import webPush from 'web-push'
import { env } from '../config/env.js'
import { PushSubscription } from '../models/PushSubscription.js'

const vapidReady = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
if (vapidReady) {
  webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidReady) return
  const subs = await PushSubscription.find({ userId })
  if (!subs.length) return

  const json = JSON.stringify(payload)
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          json,
        )
      } catch (err: unknown) {
        // 410 Gone = subscription expired, clean it up
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) {
          await PushSubscription.deleteOne({ _id: sub._id })
        }
      }
    }),
  )
}
