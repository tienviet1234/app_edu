import { useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { viDate } from '@/utils/format'
import { useNotifications, useMarkRead, useMarkAllRead } from '@/hooks/useNotifications'
import { usePushSubscription } from '@/hooks/usePushSubscription'
import { useAuthStore } from '@/store/authStore'
import { notificationService } from '@/services/notifications'
import { useAppStore } from '@/store/appStore'
import { isMongoid } from '@/utils/mongoid'

const TYPE_ICON: Record<string, string> = {
  system:     '⚙️',
  course:     '📚',
  attendance: '📅',
  report:     '📊',
  score:      '✏️',
  announcement: '📢',
}

const PUSH_LABEL: Record<string, { icon: string; text: string; color: string }> = {
  loading:     { icon: '⏳', text: 'Đang kiểm tra...', color: C.muted },
  unsupported: { icon: '⚠️', text: 'Trình duyệt không hỗ trợ push', color: C.muted },
  denied:      { icon: '🚫', text: 'Đã chặn thông báo — bật lại trong cài đặt trình duyệt', color: C.red },
  subscribed:  { icon: '🔔', text: 'Thông báo push đang bật', color: C.board2 },
  unsubscribed:{ icon: '🔕', text: 'Chưa bật thông báo push', color: C.muted },
}

function BroadcastComposer() {
  const { data } = useAppStore()
  const [classId, setClassId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('announcement')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const apiClasses = (data?.classes ?? []).filter((c) => isMongoid(c.id))

  async function send() {
    if (!classId || !title.trim() || !body.trim()) return
    setSending(true)
    setResult(null)
    try {
      const r = await notificationService.broadcast({ classId, title: title.trim(), body: body.trim(), type })
      setResult(`✓ Đã gửi tới ${r.sent} học sinh`)
      setTitle(''); setBody('')
    } catch {
      setResult('⚠ Gửi thất bại — kiểm tra kết nối')
    } finally {
      setSending(false)
    }
  }

  if (!apiClasses.length) return null

  return (
    <Card className="p-4">
      <div className="mb-3 text-sm font-bold" style={{ color: C.ink }}>📢 Gửi thông báo lớp</div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, background: C.paper }}
          >
            <option value="">Chọn lớp...</option>
            {apiClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}`, background: C.paper }}
          >
            <option value="announcement">Thông báo chung</option>
            <option value="course">Khoá học</option>
            <option value="attendance">Điểm danh</option>
            <option value="score">Điểm số</option>
          </select>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tiêu đề..."
          maxLength={160}
          className="w-full rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}`, background: C.paper }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Nội dung thông báo..."
          rows={3}
          maxLength={2000}
          className="w-full rounded-xl px-3 py-2 text-sm resize-none"
          style={{ border: `1px solid ${C.line}`, background: C.paper }}
        />
        <div className="flex items-center gap-2">
          <Btn
            kind="solid"
            onClick={send}
            disabled={sending || !classId || !title.trim() || !body.trim()}
          >
            {sending ? 'Đang gửi...' : 'Gửi cho tất cả học sinh'}
          </Btn>
          {result && (
            <span className="text-sm" style={{ color: result.startsWith('✓') ? C.board2 : C.red }}>
              {result}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

export function NotificationsPage() {
  const { user } = useAuthStore()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading } = useNotifications()
  const { mutate: markRead } = useMarkRead()
  const { mutate: markAll, isPending: markingAll } = useMarkAllRead()
  const { status: pushStatus, subscribe, unsubscribe } = usePushSubscription()

  const allItems = data?.items ?? []
  const items = allItems.filter((n) => {
    if (filter === 'unread' && n.readAt) return false
    if (typeFilter && n.type !== typeFilter) return false
    return true
  })
  const unreadCount = allItems.filter((n) => !n.readAt).length
  const push = PUSH_LABEL[pushStatus]

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black" style={{ color: C.ink }}>Thông báo</h1>
          {unreadCount > 0 && (
            <p className="mt-0.5 text-sm" style={{ color: C.muted }}>
              {unreadCount} thông báo chưa đọc
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Btn kind="solid" disabled={markingAll} onClick={() => markAll()}>
            {markingAll ? 'Đang đánh dấu...' : 'Đánh dấu tất cả đã đọc'}
          </Btn>
        )}
      </div>

      {/* Broadcast composer — teacher/admin only */}
      {(user?.role === 'teacher' || user?.role === 'admin') && <BroadcastComposer />}

      {/* Push subscription card */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <span>{push.icon}</span>
            <span style={{ color: push.color }}>{push.text}</span>
          </div>
          {pushStatus === 'unsubscribed' && (
            <Btn kind="solid" onClick={() => void subscribe()}>
              Bật thông báo push
            </Btn>
          )}
          {pushStatus === 'subscribed' && (
            <Btn onClick={() => void unsubscribe()}>Tắt thông báo push</Btn>
          )}
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background: filter === f ? C.board : C.paper,
              color: filter === f ? '#fff' : C.ink,
              border: `1px solid ${filter === f ? C.board : C.line}`,
            }}
          >
            {f === 'all' ? 'Tất cả' : 'Chưa đọc'}
          </button>
        ))}

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ border: `1px solid ${C.line}`, background: typeFilter ? C.gold : C.paper }}
        >
          <option value="">Mọi loại</option>
          <option value="system">Hệ thống</option>
          <option value="course">Khoá học</option>
          <option value="attendance">Điểm danh</option>
          <option value="report">Báo cáo</option>
          <option value="score">Điểm số</option>
          <option value="announcement">Thông báo chung</option>
        </select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-10 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl mb-2">🔔</div>
          <div className="text-sm" style={{ color: C.muted }}>
            {filter === 'unread' ? 'Không có thông báo chưa đọc.' : 'Chưa có thông báo nào.'}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n._id}
              className="p-3 cursor-pointer"
              style={{ background: n.readAt ? '#fff' : C.gold + '0C', borderLeft: n.readAt ? undefined : `3px solid ${C.gold}` }}
              onClick={() => { if (!n.readAt) markRead(n._id) }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">
                  {TYPE_ICON[n.type] ?? '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm leading-tight" style={{ color: C.ink }}>
                      {n.title}
                    </div>
                    {!n.readAt && (
                      <span
                        className="shrink-0 rounded-full h-2 w-2 mt-1.5"
                        style={{ background: C.board2 }}
                      />
                    )}
                  </div>
                  <div className="mt-1 text-sm leading-snug" style={{ color: C.muted }}>
                    {n.body}
                  </div>
                  <div className="mt-1.5 text-xs" style={{ color: C.muted }}>
                    {viDate(n.createdAt.slice(0, 10))}
                    {n.readAt && <span className="ml-2 opacity-60">· Đã đọc</span>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
