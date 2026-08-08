import { useEffect, useState } from 'react'
import { api } from '@/utils/api'

async function getVapidPublicKey(): Promise<string> {
  const res = await api.get<{ data: { publicKey: string } }>('/push/vapid-public-key')
  return res.data.data.publicKey
}


export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading'

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('loading')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription()
      setStatus(existing ? 'subscribed' : 'unsubscribed')
    })
  }, [])

  const subscribe = async () => {
    if (!('serviceWorker' in navigator)) return
    setStatus('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const publicKey = await getVapidPublicKey()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      })
      const json = sub.toJSON() as {
        endpoint: string
        keys: { p256dh: string; auth: string }
      }
      await api.post('/push/subscribe', {
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent.slice(0, 200),
      })
      setStatus('subscribed')
    } catch {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'unsubscribed')
    }
  }

  const unsubscribe = async () => {
    if (!('serviceWorker' in navigator)) return
    setStatus('loading')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await api.delete('/push/subscribe', { data: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
      setStatus('unsubscribed')
    } catch {
      setStatus('unsubscribed')
    }
  }

  return { status, subscribe, unsubscribe }
}
