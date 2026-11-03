/// <reference lib="webworker" />
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope & typeof globalThis

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Mở/tải lại app ở MỌI đường dẫn (/app, /admin...) khi mất mạng: thử mạng trước
// (có mạng vẫn y như cũ), không được hoặc quá 6 giây thì dùng trang đã lưu sẵn.
// Trước đây chỉ "/" có trong kho nên F5 ở /app lúc mất mạng ra trang lỗi của
// trình duyệt — giáo viên tưởng mất hết buổi vừa nhập. (Ghi chú: navigateFallback
// trong vite.config.ts KHÔNG có tác dụng với injectManifest.)
// Hết giờ thì HỦY hẳn lệnh tải: lệnh còn treo giữ service worker cũ bận, bản mới
// nằm chờ không kích hoạt được.
registerRoute(new NavigationRoute(async ({ request }) => {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 6000)
  try {
    return await fetch(request, { signal: abort.signal })
  } catch {
    return (await matchPrecache('/index.html')) ?? Response.error()
  } finally {
    clearTimeout(timer)
  }
}))

// Bản mới phải TỰ kích hoạt ngay khi cài xong. Ở chế độ 'autoUpdate' với
// injectManifest, vite-plugin-pwa KHÔNG gửi lệnh SKIP_WAITING — trước đây chỉ
// chờ lệnh đó (ghi chú cũ tưởng script đăng ký tự gửi — sai, đã xem tận mã
// plugin + registerSW.js thật 23/10) → Service Worker mới nằm "chờ" tới khi
// đóng HẲN mọi cửa sổ app; máy giáo viên chạy bản CŨ nhiều ngày, các bản sửa
// an toàn dữ liệu không tới được máy họ (F5 không ăn thua). App mới tự tải
// lại khi an toàn (utils/appUpdate.ts, onNeedReload).
self.addEventListener('install', () => { void self.skipWaiting() })
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
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
