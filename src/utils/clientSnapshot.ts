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
const INTERVAL_MS = 5 * 60 * 1000
const FIRST_DELAY_MS = 5_000

function deviceId(): string {
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
function quickHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${s.length}:${(h >>> 0).toString(16)}`
}

export function startClientSnapshotLoop(userId: string): () => void {
  let lastSentHash = ''
  let inFlight = false
  let stopped = false

  const send = async () => {
    if (stopped || inFlight) return
    const raw = makeStorage(userId).get()
    if (!raw) return
    const h = quickHash(raw)
    if (h === lastSentHash) return
    inFlight = true
    try {
      await backupService.uploadSnapshot(deviceId(), raw)
      lastSentHash = h
    } catch (err) {
      console.warn('Sao lưu bản chụp máy này chưa gửi được, sẽ thử lại sau:', err)
    } finally {
      inFlight = false
    }
  }

  const first = setTimeout(() => void send(), FIRST_DELAY_MS)
  const timer = setInterval(() => void send(), INTERVAL_MS)
  const onHide = () => { if (document.visibilityState === 'hidden') void send() }
  document.addEventListener('visibilitychange', onHide)

  return () => {
    stopped = true
    clearTimeout(first)
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onHide)
  }
}
