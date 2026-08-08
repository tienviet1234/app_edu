/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & typeof globalThis

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  const data = (event as PushEvent).data?.json() as {
    title?: string
    body?: string
    tag?: string
    url?: string
  } | undefined ?? {}

  ;(event as PushEvent).waitUntil(
    self.registration.showNotification(data.title ?? 'Thông báo mới', {
      body: data.body ?? '',
      icon: '/pwa-icon.svg',
      badge: '/pwa-icon.svg',
      tag: data.tag ?? 'lms',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const e = event as NotificationEvent
  e.notification.close()
  const targetUrl = (e.notification.data as { url?: string } | undefined)?.url ?? '/'
  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})
