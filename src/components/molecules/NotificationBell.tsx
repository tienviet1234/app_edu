import { useState } from 'react'
import { C } from '@/constants/colors'
import { useMarkRead, useMarkAllRead, useNotifications, useUnreadCount } from '@/hooks/useNotifications'
import { viDate } from '@/utils/format'

const TYPE_ICON: Record<string, string> = {
  system: '⚙️', course: '📚', attendance: '📅',
  report: '📊', score: '✏️', announcement: '📢',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { data: count = 0 } = useUnreadCount()
  const { data: notifs } = useNotifications()
  const { mutate: markRead } = useMarkRead()
  const { mutate: markAll, isPending } = useMarkAllRead()

  const items = notifs?.items ?? []

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl px-2 py-1.5 text-base"
        style={{ background: '#ffffff14', color: '#fff' }}
        title="Thông báo"
      >
        🔔
        {count > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: C.red, color: '#fff' }}
          >
            {count > 9 ? '9+' : count}
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
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: C.board, color: '#fff' }}
            >
              <span className="text-sm font-bold">
                Thông báo {count > 0 && <span className="opacity-70">({count} chưa đọc)</span>}
              </span>
              {count > 0 && (
                <button
                  disabled={isPending}
                  onClick={() => markAll()}
                  className="text-xs font-semibold rounded-lg px-2 py-1"
                  style={{ background: '#ffffff20', color: '#fff' }}
                >
                  Đọc hết
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.muted }}>
                Không có thông báo nào.
              </div>
            ) : (
              <div className="max-h-80 divide-y overflow-y-auto" style={{ borderColor: C.line }}>
                {items.map((n) => (
                  <button
                    key={n._id}
                    onClick={() => { if (!n.readAt) markRead(n._id) }}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-gray-50"
                    style={{ background: n.readAt ? '#fff' : '#fffbec' }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-base shrink-0">{TYPE_ICON[n.type] ?? '🔔'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1 justify-between">
                          <div className="truncate text-sm font-semibold" style={{ color: C.ink }}>
                            {n.title}
                          </div>
                          {!n.readAt && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ background: C.board2 }}
                            />
                          )}
                        </div>
                        <div className="mt-0.5 text-xs leading-snug" style={{ color: C.muted }}>
                          {n.body}
                        </div>
                        <div className="mt-1 text-[10px]" style={{ color: C.muted }}>
                          {viDate(n.createdAt.slice(0, 10))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
