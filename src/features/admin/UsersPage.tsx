import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService, type ApiUser } from '@/services/admin'
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

export function UsersPage() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'' | 'admin' | 'teacher' | 'student' | 'parent'>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ApiUser | null>(null)

  const qc = useQueryClient()

  const params: Record<string, string> = { page: String(page), limit: '20' }
  if (q) params.q = q
  if (role) params.role = role

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => adminService.listUsers(params),
    placeholderData: (prev) => prev,
  })

  const { mutate: updateUser, isPending } = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof adminService.updateUser>[1] }) =>
      adminService.updateUser(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setEditing(null)
    },
  })

  const handleSearch = useCallback((v: string) => {
    setQ(v)
    setPage(1)
  }, [])

  const users = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Quản lý người dùng</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>
          {total.toLocaleString('vi')} tài khoản trong hệ thống
        </p>
      </div>

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
      </Card>

      {/* User list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
        ) : users.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>
            Không tìm thấy người dùng nào.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
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
                  <tr key={u._id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2.5 px-4 font-semibold">{u.name}</td>
                    <td className="py-2.5 px-4" style={{ color: C.muted }}>{u.email}</td>
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
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          background: u.isActive ? C.board2 + '18' : C.red + '18',
                          color: u.isActive ? C.board2 : C.red,
                        }}
                      >
                        {u.isActive ? 'Hoạt động' : 'Khóa'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setEditing(u)}
                        className="text-xs font-semibold"
                        style={{ color: C.blue }}
                      >
                        Sửa
                      </button>
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

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: '#00000060' }}
          onClick={() => setEditing(null)}
        >
          <Card
            className="w-full max-w-sm p-6 space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="font-bold text-base" style={{ color: C.ink }}>
              Sửa tài khoản
            </div>
            <div className="text-sm" style={{ color: C.muted }}>{editing.email}</div>

            <label className="block text-sm">
              <div className="mb-1 font-medium" style={{ color: C.muted }}>Tên</div>
              <input
                defaultValue={editing.name}
                id="edit-name"
                className="w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>

            <label className="block text-sm">
              <div className="mb-1 font-medium" style={{ color: C.muted }}>Vai trò</div>
              <select
                defaultValue={editing.role}
                id="edit-role"
                className="w-full rounded-xl px-3 py-2 font-semibold"
                style={{ border: `1px solid ${C.line}` }}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={editing.isActive}
                id="edit-active"
                className="h-4 w-4 rounded"
              />
              <span style={{ color: C.ink }}>Tài khoản đang hoạt động</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Btn
                kind="solid"
                disabled={isPending}
                onClick={() => {
                  const name = (document.getElementById('edit-name') as HTMLInputElement).value.trim()
                  const role = (document.getElementById('edit-role') as HTMLSelectElement).value
                  const isActive = (document.getElementById('edit-active') as HTMLInputElement).checked
                  updateUser({ id: editing._id, patch: { name, role, isActive } })
                }}
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
