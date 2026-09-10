import { useState } from 'react'
import { C } from '@/constants/colors'
import { useToastStore } from '@/store/toastStore'
import type { ToastType } from '@/store/toastStore'

const ICON: Record<ToastType, string> = { success: '✓', error: '⚠', info: 'ℹ' }
const COLOR: Record<ToastType, string> = { success: C.emerald, error: C.rose, info: C.board2 }

function timeAgo(at: number): string {
  const sec = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (sec < 60) return 'vừa xong'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} phút trước`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} giờ trước`
  return `${Math.round(hr / 24)} ngày trước`
}

/** Nhật ký các việc hệ thống tự làm (tạo buổi tự động, áp dụng cho cả lớp,
 *  lỗi đồng bộ...) — khác với chuông 🔔 Thông báo (dành cho thông báo
 *  nghiệp vụ thật như bài tập mới, báo cáo đã gửi). Chỉ lưu trong phiên
 *  làm việc hiện tại, không đồng bộ server. */
export function SystemLogBell() {
  const [open, setOpen] = useState(false)
  const history = useToastStore((s) => s.history)
  const clearHistory = useToastStore((s) => s.clearHistory)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl px-2 py-1.5 text-base"
        style={{ background: '#ffffff14', color: '#fff' }}
        title="Nhật ký hệ thống"
      >
        🛎
        {history.length > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: C.gold, color: '#2A1F05' }}
          >
            {history.length > 9 ? '9+' : history.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-10 z-20 w-80 overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: '#fff', border: `1px solid ${C.line}` }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <span className="text-sm font-bold">Nhật ký hệ thống</span>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="rounded-lg px-2 py-1 text-xs font-semibold"
                  style={{ background: '#ffffff20', color: '#fff' }}
                >
                  Xóa hết
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>
                Chưa có việc gì hệ thống tự ghi lại.
              </div>
            ) : (
              <div className="max-h-80 divide-y overflow-y-auto" style={{ borderColor: C.line }}>
                {history.map((h) => (
                  <div key={h.id} className="px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 font-bold" style={{ color: COLOR[h.type] }}>{ICON[h.type]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm" style={{ color: C.ink }}>{h.message}</div>
                        <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{timeAgo(h.at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
