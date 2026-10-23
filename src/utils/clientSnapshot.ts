import { backupService } from '@/services/backups'
import { makeStorage } from '@/utils/storage'

/** Tự gửi bản chụp TOÀN BỘ dữ liệu đang nằm trên máy này (localStorage) lên
 *  server — bất kể từng buổi/điểm đã lên server được hay chưa. Lưới an toàn
 *  cuối cùng cho sự cố kiểu 18/10 (điểm kẹt trên máy vì server từ chối): dù
 *  sau đó máy bị xóa dữ liệu duyệt web/hỏng/mất, admin vẫn tải lại được bản
 *  chụp và nạp bằng nút "Nhập file sao lưu".
 *
 *  CHỈ ĐỌC localStorage — không bao giờ ghi/sửa dữ liệu trên máy, lỗi mạng
 *  hay server lỗi đều im lặng bỏ qua (lần sau gửi lại), không chặn việc gì. */

const DEVICE_KEY = 'lms:deviceId'
// Trước đây 5 phút/lần: giáo viên mở app, nhập vài phút rồi đóng luôn (lần gửi
// lúc đóng tab bị trình duyệt hủy ngang) thì phần vừa nhập không có bản chụp
// nào (gặp thật 22/10, máy cô Trà 13:31–13:35). Giờ 30 giây kiểm tra 1 lần, có
// đổi thì gửi, tối đa 1 lần/phút (server dọn bản cũ thưa dần —
// server/src/utils/snapshotRetention.ts).
const CHECK_MS = 30_000
const MIN_GAP_MS = 60_000
const FIRST_DELAY_MS = 5_000

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

// Hash rẻ (FNV-1a 32-bit) chỉ để biết "đã đổi gì chưa" giữa các lần gửi —
// server tự kiểm tra lại bằng sha256, nên trùng hash hiếm hoi cũng không hại.
export function quickHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${s.length}:${(h >>> 0).toString(16)}`
}

export function startClientSnapshotLoop(userId: string): () => void {
  let lastSentHash = ''
  let lastSentAt = 0
  let inFlight = false
  let stopped = false

  /** `now` = gửi ngay không chờ đủ khoảng cách tối thiểu (mở app, rời tab). */
  const send = async (now = false) => {
    if (stopped || inFlight) return
    if (!now && Date.now() - lastSentAt < MIN_GAP_MS) return
    const raw = makeStorage(userId).get()
    if (!raw) return
    const h = quickHash(raw)
    if (h === lastSentHash) return
    inFlight = true
    try {
      await backupService.uploadSnapshot(deviceId(), raw)
      lastSentHash = h
      lastSentAt = Date.now()
    } catch (err) {
      console.warn('Sao lưu bản chụp máy này chưa gửi được, sẽ thử lại sau:', err)
    } finally {
      inFlight = false
    }
  }

  const first = setTimeout(() => void send(true), FIRST_DELAY_MS)
  const timer = setInterval(() => void send(), CHECK_MS)
  const onHide = () => { if (document.visibilityState === 'hidden') void send(true) }
  document.addEventListener('visibilitychange', onHide)

  return () => {
    stopped = true
    clearTimeout(first)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onHide)
  }
}
