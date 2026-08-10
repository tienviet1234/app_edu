import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/utils/api'
import { C } from '@/constants/colors'

interface Actor {
  _id: string
  name: string
  role: string
  email: string
}

interface ActivityItem {
  _id: string
  actorId?: Actor
  actorRole?: string
  action: string
  resource: string
  metadata?: Record<string, unknown>
  ip?: string
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  'session.create': 'Tạo buổi học mới',
  'score.entry': 'Nhập điểm học sinh',
  'score.upsert': 'Lưu điểm lên cloud',
  'report.export.student': 'Xuất báo cáo học sinh',
  'report.export.monthly': 'Xuất báo cáo tháng',
  'class.create': 'Tạo lớp học',
  'class.update': 'Cập nhật lớp',
  'class.delete': 'Xóa lớp',
  'class.enroll': 'Thêm học sinh',
  'class.join': 'Vào lớp',
  'session.complete': 'Kết thúc buổi học',
  'app.action': 'Thao tác',
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#1B3A6B',
  teacher: '#2E74C0',
  student: '#059669',
  parent: '#D97706',
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Giáo viên',
  student: 'Học sinh',
  parent: 'Phụ huynh',
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  return `${d} ngày trước`
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function actionIcon(action: string): string {
  if (action.startsWith('session')) return '📅'
  if (action.startsWith('score')) return '✏️'
  if (action.startsWith('report')) return '📄'
  if (action.startsWith('class')) return '🏫'
  return '🔔'
}

const PAGE_SIZE = 30

export function AdminActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterAction, setFilterAction] = useState('')

  const pageRef = useRef(page)
  useEffect(() => { pageRef.current = page }, [page])

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(p) })
      if (filterAction) params.set('action', filterAction)
      if (filterRole) params.set('actorRole', filterRole)
      const res = await api.get<{ data: { items: ActivityItem[]; total: number } }>(`/audit-logs?${params}`)
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
      setError('')
    } catch {
      setError('Không thể tải dữ liệu hoạt động')
    } finally {
      setLoading(false)
    }
  }, [filterAction, filterRole])

  // Reset to page 1 and reload when filters change
  useEffect(() => {
    setPage(1)
    void load(1)
  }, [filterAction, filterRole, load])

  // Reload when page changes (but not when filters change — handled above)
  useEffect(() => {
    void load(page)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // Auto-refresh — uses ref to always have latest page, recreates when filters change
  useEffect(() => {
    const t = setInterval(() => void load(pageRef.current), 30000)
    return () => clearInterval(t)
  }, [load])

  const today = new Date().toDateString()
  const todayItems = items.filter((i) => new Date(i.createdAt).toDateString() === today)

  // Count by role in current page
  const roleCounts: Record<string, number> = {}
  items.forEach((i) => {
    const r = i.actorRole ?? 'unknown'
    roleCounts[r] = (roleCounts[r] ?? 0) + 1
  })

  // Unique actors today in current page
  const todayActors = new Set(
    todayItems.map((i) => i.actorId?._id ?? i.actorRole).filter(Boolean),
  ).size

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const actionGroups = [...new Set(items.map((i) => i.action.split('.')[0]))].sort()

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Hoạt động hệ thống</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Theo dõi thời gian thực — tự làm mới mỗi 30 giây
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Tổng hoạt động', val: total, icon: '📊' },
          { label: 'Trang này / Hôm nay', val: todayItems.length, icon: '📅' },
          { label: 'Người dùng (trang này)', val: todayActors, icon: '👥' },
          { label: 'Giáo viên (trang này)', val: roleCounts['teacher'] ?? 0, icon: '👩‍🏫' },
        ].map(({ label, val, icon }) => (
          <div
            key={label}
            className="rounded-2xl p-3 flex flex-col gap-0.5"
            style={{ background: C.paper, border: `1px solid ${C.line}` }}
          >
            <div className="text-xl">{icon}</div>
            <div className="text-2xl font-black tabular-nums" style={{ color: C.board }}>
              {val}
            </div>
            <div className="text-xs" style={{ color: C.muted }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Role breakdown */}
      {Object.keys(roleCounts).length > 0 && (
        <div className="rounded-2xl p-3 flex flex-wrap gap-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <span className="text-xs font-semibold self-center" style={{ color: C.muted }}>Theo vai trò:</span>
          {Object.entries(roleCounts).map(([role, count]) => (
            <button
              key={role}
              onClick={() => setFilterRole(filterRole === role ? '' : role)}
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{
                background: filterRole === role ? ROLE_COLORS[role] ?? '#666' : (ROLE_COLORS[role] ?? '#666') + '22',
                color: filterRole === role ? '#fff' : ROLE_COLORS[role] ?? '#666',
              }}
            >
              {ROLE_LABELS[role] ?? role} · {count}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        >
          <option value="">Tất cả hoạt động</option>
          {actionGroups.map((g) => (
            <option key={g} value={g}>
              {g === 'session' ? 'Buổi học' : g === 'score' ? 'Nhập điểm' : g === 'report' ? 'Báo cáo' : g === 'class' ? 'Lớp học' : g}
            </option>
          ))}
        </select>
        {(filterRole || filterAction) && (
          <button
            onClick={() => { setFilterRole(''); setFilterAction('') }}
            className="rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: C.line }}
          >
            Xóa bộ lọc ×
          </button>
        )}
        <span className="ml-auto text-xs" style={{ color: C.muted }}>
          {items.length} / {total} hoạt động
        </span>
        <button
          onClick={() => void load(page)}
          className="rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ background: C.board + '18', color: C.board }}
        >
          ↻ Làm mới
        </button>
      </div>

      {/* Feed */}
      {loading && (
        <div className="text-center py-8 text-sm" style={{ color: C.muted }}>
          Đang tải...
        </div>
      )}
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', color: '#DC2626' }}>
          {error}
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
          <div className="text-3xl mb-2">📭</div>
          <div className="text-sm" style={{ color: C.muted }}>
            Chưa có hoạt động nào được ghi lại.
          </div>
          <div className="text-xs mt-1" style={{ color: C.muted }}>
            Hoạt động sẽ xuất hiện khi giáo viên tạo buổi học, nhập điểm hoặc xuất báo cáo.
          </div>
        </div>
      )}
      {!loading && items.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${C.line}` }}
        >
          {items.map((item, i) => {
            const actor = item.actorId
            const role = item.actorRole ?? actor?.role ?? 'unknown'
            const name = actor?.name ?? 'Người dùng'
            const label = ACTION_LABELS[item.action] ?? item.action
            const icon = actionIcon(item.action)
            const meta = item.metadata ?? {}
            const isLast = i === items.length - 1

            return (
              <div
                key={item._id}
                className="flex items-start gap-3 px-4 py-3"
                style={{
                  background: i % 2 === 0 ? C.paper : undefined,
                  borderBottom: isLast ? undefined : `1px solid ${C.line}`,
                }}
              >
                {/* Icon */}
                <div
                  className="rounded-xl w-9 h-9 flex items-center justify-center shrink-0 text-base"
                  style={{ background: (ROLE_COLORS[role] ?? '#666') + '18' }}
                >
                  {icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-sm" style={{ color: C.board }}>{name}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: (ROLE_COLORS[role] ?? '#666') + '22',
                        color: ROLE_COLORS[role] ?? '#666',
                      }}
                    >
                      {ROLE_LABELS[role] ?? role}
                    </span>
                    <span className="text-sm" style={{ color: C.muted }}>—</span>
                    <span className="text-sm font-semibold">{label}</span>
                  </div>
                  {/* Metadata pills */}
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {!!meta.className && (
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: C.board + '12', color: C.board }}>
                        🏫 {String(meta.className)}
                      </span>
                    )}
                    {meta.sessionNo !== undefined && (
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: '#F0F9FF', color: '#0369A1' }}>
                        Buổi {String(meta.sessionNo)}
                      </span>
                    )}
                    {!!meta.studentName && (
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: '#F0FDF4', color: '#15803D' }}>
                        👤 {String(meta.studentName)}
                      </span>
                    )}
                    {!!meta.period && (
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: '#FFF7ED', color: '#C2410C' }}>
                        {String(meta.period)}
                      </span>
                    )}
                    {meta.students !== undefined && (
                      <span className="text-xs rounded-lg px-2 py-0.5" style={{ background: '#F5F3FF', color: '#6D28D9' }}>
                        {String(meta.students)} học sinh
                      </span>
                    )}
                  </div>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold" style={{ color: C.muted }}>
                    {relTime(item.createdAt)}
                  </div>
                  <div className="text-[10px]" style={{ color: C.muted }}>
                    {absTime(item.createdAt)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ border: `1px solid ${C.line}` }}
          >
            ← Trước
          </button>
          <span className="text-sm" style={{ color: C.muted }}>
            Trang {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ border: `1px solid ${C.line}` }}
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  )
}
