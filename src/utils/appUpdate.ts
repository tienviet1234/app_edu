import { registerSW } from 'virtual:pwa-register'
import { hasActiveSyncs } from '@/utils/syncLocks'
import { useAppStore } from '@/store/appStore'
import { toast } from '@/store/toastStore'

/** Bản app mới đã sẵn sàng (Service Worker mới đã nắm quyền) → tải lại trang
 *  ngay khi AN TOÀN: tab đang ẩn, hoặc không đang gõ và không có buổi nào đang
 *  gửi dở lên server. Ghi ngay dữ liệu đang chờ xuống máy trước khi tải lại.
 *  Trước đây bản mới không bao giờ tự kích hoạt → máy giáo viên chạy bản cũ
 *  nhiều ngày (xem src/sw.ts). */
function reloadWhenSafe() {
  const typing = () => {
    const el = document.activeElement as HTMLElement | null
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  }
  const safe = () => document.visibilityState === 'hidden' || (!typing() && !hasActiveSyncs())
  const go = () => {
    useAppStore.getState().flushPersist()
    window.location.reload()
  }
  if (safe()) { go(); return }
  toast.info('Có bản cập nhật app — sẽ tự tải lại khi bạn ngừng gõ (dữ liệu đã lưu trên máy).')
  const timer = setInterval(() => { if (safe()) { clearInterval(timer); go() } }, 3000)
}

let updateWaiting = false

/** Bản app mới đã tải xong, đang chờ đổi. Trình duyệt chỉ đổi Service Worker khi
 *  bản cũ không còn yêu cầu nào đang chạy, chờ tối đa 5 phút. Đồng bộ nền lúc mở
 *  app gửi yêu cầu liên tục nên giữ máy ở bản cũ đủ 5 phút (đo trong Edge 04/11:
 *  301 giây ở trạng thái `waiting`) — giáo viên điểm danh trên bản cũ đúng lúc đó.
 *  Vòng đồng bộ thấy cờ này thì dừng: phần chưa gửi còn trên máy, tải lại gửi tiếp. */
export function isAppUpdateWaiting(): boolean {
  return updateWaiting
}

function watchForWaitingUpdate(reg: ServiceWorkerRegistration) {
  // Không có controller = lần cài đầu tiên, không phải đổi bản: đừng dừng đồng bộ.
  const mark = () => { if (navigator.serviceWorker.controller) updateWaiting = true }
  const follow = (worker: ServiceWorker | null) => {
    if (!worker) return
    if (worker.state === 'installed') mark()
    worker.addEventListener('statechange', () => { if (worker.state === 'installed') mark() })
  }
  if (reg.waiting) mark()
  follow(reg.installing)
  reg.addEventListener('updatefound', () => follow(reg.installing))
}

export function startAppUpdates(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({
    immediate: true,
    onNeedReload: reloadWhenSafe,
    // Tab mở cả ngày vẫn nhận bản mới: kiểm tra mỗi 15 phút.
    onRegisteredSW: (_url, reg) => {
      if (!reg) return
      watchForWaitingUpdate(reg)
      setInterval(() => { reg.update().catch(() => {}) }, 15 * 60_000)
    },
  })
  // Trang đang chạy bản cũ tải 1 phần app (màn mở sau) mà file đó đã bị thay
  // bằng bản mới → tải lại 1 lần để lấy đúng bản mới thay vì báo lỗi.
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (sessionStorage.getItem('lms:preloadReload')) return
      sessionStorage.setItem('lms:preloadReload', '1')
    } catch { /* bộ nhớ phiên bị chặn — vẫn thử tải lại 1 lần */ }
    event.preventDefault()
    useAppStore.getState().flushPersist()
    window.location.reload()
  })
}
