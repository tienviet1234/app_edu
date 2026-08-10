import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService, type ApiUser, type InviteToken } from '@/services/admin'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị',
  teacher: 'Giáo viên',
  student: 'Học sinh',
  parent: 'Phụ huynh',
}

const ROLE_COLORS: Record<string, string> = {
  admin: C.red,
  teacher: C.board2,
  student: C.blue,
  parent: '#7A5A05',
}

const ROLES = ['', 'admin', 'teacher', 'student', 'parent'] as const

interface EditState {
  name: string
  role: string
  isActive: boolean
}

// ─── Invite status helpers ────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  active: 'Còn dùng',
  used: 'Đã dùng',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
}
const STATUS_COLOR: Record<string, string> = {
  active: '#059669',
  used: '#2E74C0',
  expired: '#6B7280',
  revoked: '#DC2626',
}

function viDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Invite management panel ──────────────────────────────────────────────────
function InvitePanel() {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: () => adminService.listInvites({ limit: '50' }),
  })

  const { mutate: createInvite, isPending: isCreating } = useMutation({
    mutationFn: () => adminService.createInvite({ note: note.trim() || undefined, expireDays: 7 }),
    onSuccess: (token) => {
      setNewCode(token.code)
      setNote('')
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
  })

  const { mutate: revokeInvite, isPending: isRevoking } = useMutation({
    mutationFn: (id: string) => adminService.revokeInvite(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'invites'] }),
  })

  function copyCode(code: string, id: string) {
    void navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const invites: InviteToken[] = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* Create new invite */}
      <Card className="p-4 space-y-3">
        <div className="font-bold text-sm" style={{ color: C.ink }}>Tạo mã mời giáo viên mới</div>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tên giáo viên, vd: Cô Oanh) — tùy chọn"
            className="flex-1 rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
            maxLength={100}
          />
          <Btn kind="solid" onClick={() => createInvite()} disabled={isCreating}>
            {isCreating ? '...' : '+ Tạo mã'}
          </Btn>
        </div>
        <p className="text-xs" style={{ color: C.muted }}>
          Mã có hiệu lực 7 ngày. Gửi mã cho giáo viên qua Zalo/email — họ nhập khi đăng ký.
        </p>

        {/* Newly created code highlight */}
        {newCode && (
          <div
            className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC' }}
          >
            <div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: '#15803D' }}>Mã mời vừa tạo</div>
              <div className="font-black text-2xl tracking-widest" style={{ color: '#15803D', fontFamily: 'monospace' }}>
                {newCode}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => copyCode(newCode, 'new')}
                className="rounded-lg px-3 py-1.5 text-xs font-bold"
                style={{ background: '#15803D', color: '#fff' }}
              >
                {copiedId === 'new' ? '✓ Đã copy' : '📋 Copy'}
              </button>
              <button
                onClick={() => setNewCode(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ color: C.muted }}
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Invite list */}
      <Card className="overflow-hidden">
        <div className="px-4 py-2.5 text-xs font-semibold" style={{ background: C.paper, color: C.muted }}>
          LỊCH SỬ MÃ MỜI ({invites.length})
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
        ) : invites.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có mã mời nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['Mã', 'Ghi chú', 'Người dùng', 'Hết hạn', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: C.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const actor = typeof inv.usedBy === 'object' && inv.usedBy ? inv.usedBy : null
                  return (
                    <tr key={inv._id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-black tracking-widest text-sm" style={{ fontFamily: 'monospace', color: C.board }}>
                            {inv.code}
                          </span>
                          {inv.status === 'active' && (
                            <button
                              onClick={() => copyCode(inv.code, inv._id)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                              style={{ background: C.board + '18', color: C.board }}
                            >
                              {copiedId === inv._id ? '✓' : '📋'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs" style={{ color: C.muted }}>
                        {inv.note ?? '—'}
                      </td>
                      <td className="py-2 px-3 text-xs">
                        {actor ? (
                          <span className="font-semibold">{actor.name}</span>
                        ) : inv.status === 'used' ? (
                          <span style={{ color: C.muted }}>Đã dùng</span>
                        ) : '—'}
                      </td>
                      <td className="py-2 px-3 text-xs" style={{ color: C.muted }}>
                        {viDate(inv.expiresAt)}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: (STATUS_COLOR[inv.status] ?? C.muted) + '18',
                            color: STATUS_COLOR[inv.status] ?? C.muted,
                          }}
                        >
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {inv.status === 'active' && (
                          <button
                            onClick={() => revokeInvite(inv._id)}
                            disabled={isRevoking}
                            className="text-xs font-semibold"
                            style={{ color: C.red }}
                          >
                            Thu hồi
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export function UsersPage() {
  const [tab, setTab] = useState<'users' | 'invites'>('users')
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'' | 'admin' | 'teacher' | 'student' | 'parent'>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'active'>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ApiUser | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', role: 'teacher', isActive: true })

  const qc = useQueryClient()

  const params: Record<string, string> = { page: String(page), limit: '20' }
  if (q) params.q = q
  if (role) params.role = role
  if (statusFilter === 'pending') params.isActive = 'false'
  else if (statusFilter === 'active') params.isActive = 'true'

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminService.listUsers(params),
    placeholderData: (prev) => prev,
  })

  const { data: pendingMeta } = useQuery({
    queryKey: ['admin', 'users-pending-count'],
    queryFn: () => adminService.listUsers({ isActive: 'false', limit: '1' }),
    staleTime: 30_000,
  })

  const { mutate: updateUser, isPending } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof adminService.updateUser>[1] }) =>
      adminService.updateUser(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setEditing(null)
    },
  })

  const handleSearch = useCallback((v: string) => {
    setQ(v)
    setPage(1)
  }, [])

  function openEdit(u: ApiUser) {
    setEditing(u)
    setEditState({ name: u.name, role: u.role, isActive: u.isActive })
  }

  function quickApprove(u: ApiUser) {
    updateUser({ id: u._id, patch: { isActive: true } })
  }

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const pendingCount = pendingMeta?.total ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: C.ink }}>Quản lý người dùng</h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            {total.toLocaleString('vi')} tài khoản trong hệ thống
          </p>
        </div>
        {pendingCount > 0 && tab === 'users' && (
          <div
            className="rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1.5"
            style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}
          >
            ⏳ {pendingCount} chờ duyệt
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: C.line }}>
        {([['users', '👥 Tài khoản'], ['invites', '🎫 Mã mời GV']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl px-4 py-1.5 text-sm font-semibold transition-all"
            style={{
              background: tab === k ? '#fff' : 'transparent',
              color: tab === k ? C.board : C.muted,
              boxShadow: tab === k ? '0 1px 3px #0001' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'invites' && <InvitePanel />}

      {tab === 'users' && <>
      {/* Filters */}
      <Card className="p-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc email..."
          className="flex-1 min-w-[200px] rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value as typeof role); setPage(1) }}
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ border: `1px solid ${C.line}` }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r ? ROLE_LABELS[r] : 'Tất cả vai trò'}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ border: `1px solid ${C.line}` }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="pending">⏳ Chờ duyệt</option>
          <option value="active">✅ Hoạt động</option>
        </select>
      </Card>

      {/* User list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>
            {statusFilter === 'pending' ? 'Không có tài khoản nào đang chờ duyệt.' : 'Không tìm thấy người dùng nào.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['Tên', 'Email', 'Vai trò', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u._id}
                    style={{
                      borderTop: `1px solid ${C.line}`,
                      background: !u.isActive ? '#FFFBEB' : undefined,
                    }}
                  >
                    <td className="py-2.5 px-4 font-semibold">{u.name}</td>
                    <td className="py-2.5 px-4 text-xs" style={{ color: C.muted }}>{u.email}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          background: (ROLE_COLORS[u.role] ?? C.muted) + '18',
                          color: ROLE_COLORS[u.role] ?? C.muted,
                        }}
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      {u.isActive ? (
                        <span
                          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ background: C.board2 + '18', color: C.board2 }}
                        >
                          Hoạt động
                        </span>
                      ) : (
                        <span
                          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ background: '#FEF3C7', color: '#92400E' }}
                        >
                          ⏳ Chờ duyệt
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex justify-end items-center gap-2">
                        {!u.isActive && (
                          <button
                            onClick={() => quickApprove(u)}
                            disabled={isPending}
                            className="rounded-lg px-2.5 py-1 text-xs font-bold"
                            style={{ background: C.board2 + '18', color: C.board2 }}
                          >
                            ✓ Duyệt
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(u)}
                          className="text-xs font-semibold"
                          style={{ color: C.blue }}
                        >
                          Sửa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Btn disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Btn>
          <span className="px-3 py-2 text-sm" style={{ color: C.muted }}>
            {page} / {totalPages}
          </span>
          <Btn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</Btn>
        </div>
      )}

      {/* Edit modal — controlled state, no document.getElementById */}
      {/* End of users tab */}
      </>}

      {/* Edit modal — outside tab conditional so it can render above everything */}
      {editing && tab === 'users' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: '#00000060' }}
          onClick={() => setEditing(null)}
        >
          <Card
            className="w-full max-w-sm p-6 space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="font-bold text-base" style={{ color: C.ink }}>Sửa tài khoản</div>
            <div className="text-sm" style={{ color: C.muted }}>{editing.email}</div>

            <label className="block text-sm">
              <div className="mb-1 font-medium" style={{ color: C.muted }}>Tên</div>
              <input
                value={editState.name}
                onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>

            <label className="block text-sm">
              <div className="mb-1 font-medium" style={{ color: C.muted }}>Vai trò</div>
              <select
                value={editState.role}
                onChange={(e) => setEditState((s) => ({ ...s, role: e.target.value }))}
                className="w-full rounded-xl px-3 py-2 font-semibold"
                style={{ border: `1px solid ${C.line}` }}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editState.isActive}
                onChange={(e) => setEditState((s) => ({ ...s, isActive: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              <span style={{ color: C.ink }}>Tài khoản đang hoạt động</span>
            </label>

            {!editState.isActive && editing.isActive && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: '#FEF2F2', color: '#DC2626' }}>
                Tắt hoạt động sẽ ngăn người dùng này đăng nhập.
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Btn
                kind="solid"
                disabled={isPending || !editState.name.trim()}
                onClick={() =>
                  updateUser({ id: editing._id, patch: { name: editState.name.trim(), role: editState.role, isActive: editState.isActive } })
                }
              >
                {isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Btn>
              <Btn onClick={() => setEditing(null)}>Hủy</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
