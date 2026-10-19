/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & typeof globalThis

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// BẮT BUỘC để registerType: 'autoUpdate' (vite.config.ts) hoạt động đúng —
// thiếu đoạn này, Service Worker MỚI tải về sau mỗi lần push code chỉ nằm
// "chờ" (waiting), không bao giờ tự kích hoạt — F5 bao nhiêu lần vẫn chạy
// bản CŨ, chỉ đóng HẲN trình duyệt (đóng hết tab) mới lên bản mới. Script
// đăng ký tự sinh của vite-plugin-pwa đã tự gửi message này + tự reload khi
// nhận 'controllerchange' — chỉ cần lắng nghe và gọi skipWaiting() ở đây là
// đủ, không cần code gì thêm ở phía app. Gặp thật: nhiều lần người dùng báo
// "F5 không ăn thua, phải đóng hẳn trình duyệt mới hết lỗi" trong phiên này.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

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
