import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService, type ApiCourse } from '@/services/admin'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const STATUS_LABEL: Record<string, string> = {
  active: 'Đang hoạt động',
  draft: 'Nháp',
  archived: 'Lưu trữ',
}
const STATUS_COLOR: Record<string, string> = {
  active: C.board2,
  draft: C.muted,
  archived: C.red,
}
const LEVEL_LABEL: Record<string, string> = {
  primary: 'Cấp 1 (lớp 1–5)',
  secondary: 'Cấp 2 & 3 (lớp 6–12)',
}

const EMPTY_FORM = { name: '', code: '', level: 'primary', totalSessions: 8, status: 'active' }

export function CoursesPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ApiCourse | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saveError, setSaveError] = useState('')

  const qc = useQueryClient()
  const params: Record<string, string> = { page: String(page), limit: '20' }
  if (q) params.q = q

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'courses', params],
    queryFn: () => adminService.listCourses(params),
    placeholderData: (prev) => prev,
  })

  const { mutate: saveCourse, isPending } = useMutation({
    mutationFn: () => {
      const level = form.level as 'primary' | 'secondary'
      const status = form.status as 'active' | 'draft' | 'archived'
      const body = { ...form, level, status, totalSessions: Number(form.totalSessions) }
      return editing
        ? adminService.updateCourse(editing._id, body)
        : adminService.createCourse(body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
      setEditing(null)
      setCreating(false)
      setForm(EMPTY_FORM)
      setSaveError('')
    },
    onError: () => setSaveError('Lưu thất bại. Kiểm tra lại tên khóa học.'),
  })

  const courses = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const openEdit = (c: ApiCourse) => {
    setEditing(c)
    setCreating(true)
    setForm({
      name: c.name,
      code: c.code ?? '',
      level: c.level,
      totalSessions: c.totalSessions ?? 8,
      status: c.status,
    })
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveError('')
    setCreating(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: C.ink }}>Quản lý khóa học</h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>
            {total.toLocaleString('vi')} khóa học trong hệ thống
          </p>
        </div>
        <Btn kind="solid" onClick={openCreate}>+ Tạo khóa học</Btn>
      </div>

      {/* Search */}
      <Card className="p-3">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1) }}
          placeholder="Tìm theo tên hoặc mã khóa học..."
          className="w-full rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        />
      </Card>

      {/* Course list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
        ) : courses.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-3xl mb-2">📚</div>
            <div className="text-sm" style={{ color: C.muted }}>Chưa có khóa học nào.</div>
            <Btn kind="solid" className="mt-3" onClick={openCreate}>+ Tạo khóa học đầu tiên</Btn>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['Tên khóa học', 'Mã', 'Cấp', 'Buổi', 'Trạng thái', ''].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c._id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2.5 px-4 font-semibold">{c.name}</td>
                    <td className="py-2.5 px-4 font-mono text-xs" style={{ color: C.muted }}>
                      {c.code ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs">{LEVEL_LABEL[c.level] ?? c.level}</td>
                    <td className="py-2.5 px-4 tabular-nums">{c.totalSessions ?? '—'}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          background: (STATUS_COLOR[c.status] ?? C.muted) + '18',
                          color: STATUS_COLOR[c.status] ?? C.muted,
                        }}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => openEdit(c)}
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
          <span className="px-3 py-2 text-sm" style={{ color: C.muted }}>{page} / {totalPages}</span>
          <Btn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</Btn>
        </div>
      )}

      {/* Create / Edit modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: '#00000060' }}
          onClick={() => { setCreating(false); setEditing(null) }}
        >
          <Card
            className="w-full max-w-sm p-6 space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="font-bold text-base" style={{ color: C.ink }}>
              {editing ? 'Sửa khóa học' : 'Tạo khóa học mới'}
            </div>

            {[
              { label: 'Tên khóa học *', key: 'name', type: 'text', ph: 'Tiếng Anh Cấp 1A' },
              { label: 'Mã khóa học', key: 'code', type: 'text', ph: 'CAP1A' },
              { label: 'Tổng số buổi', key: 'totalSessions', type: 'number', ph: '8' },
            ].map(({ label, key, type, ph }) => (
              <label key={key} className="block text-sm">
                <div className="mb-1 font-medium" style={{ color: C.muted }}>{label}</div>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={ph}
                  className="w-full rounded-xl px-3 py-2"
                  style={{ border: `1px solid ${C.line}` }}
                />
              </label>
            ))}

            <label className="block text-sm">
              <div className="mb-1 font-medium" style={{ color: C.muted }}>Cấp học</div>
              <select
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                className="w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              >
                <option value="primary">Cấp 1 (lớp 1–5)</option>
                <option value="secondary">Cấp 2 & 3 (lớp 6–12)</option>
              </select>
            </label>

            {editing && (
              <label className="block text-sm">
                <div className="mb-1 font-medium" style={{ color: C.muted }}>Trạng thái</div>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-xl px-3 py-2"
                  style={{ border: `1px solid ${C.line}` }}
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="draft">Nháp</option>
                  <option value="archived">Lưu trữ</option>
                </select>
              </label>
            )}

            {saveError && <div className="text-xs" style={{ color: C.red }}>{saveError}</div>}

            <div className="flex gap-2 pt-2">
              <Btn kind="solid" disabled={isPending || !form.name.trim()} onClick={() => saveCourse()}>
                {isPending ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Tạo khóa học'}
              </Btn>
              <Btn onClick={() => { setCreating(false); setEditing(null) }}>Hủy</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
