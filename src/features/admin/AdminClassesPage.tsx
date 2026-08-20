import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { classService, type ApiClass } from '@/services/classes'
import { adminService } from '@/services/admin'
import { C } from '@/constants/colors'

const STATUS_LABEL: Record<string, string> = {
  active: 'Đang học',
  upcoming: 'Sắp khai giảng',
  completed: 'Đã kết thúc',
  cancelled: 'Đã huỷ',
}
const STATUS_COLOR: Record<string, string> = {
  active: '#16A34A',
  upcoming: '#2563EB',
  completed: C.muted,
  cancelled: '#DC2626',
}

function TeacherName({ teacherId }: { teacherId: ApiClass['teacherId'] }) {
  if (!teacherId) return <span style={{ color: C.muted }}>Chưa phân công</span>
  if (typeof teacherId === 'object' && 'name' in (teacherId as object)) {
    return <span>{(teacherId as unknown as { name: string }).name}</span>
  }
  return <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>{String(teacherId).slice(-6)}</span>
}

function AssignTeacher({ cls }: { cls: ApiClass }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const { data: teachersData } = useQuery({
    queryKey: ['admin', 'teachers'],
    queryFn: () => adminService.listUsers({ role: 'teacher', limit: '100', isActive: 'true' }),
    staleTime: 60_000,
  })
  const teachers = teachersData?.items ?? []

  const currentId = typeof cls.teacherId === 'object' && cls.teacherId !== null
    ? (cls.teacherId as unknown as { _id: string })._id
    : typeof cls.teacherId === 'string' ? cls.teacherId : ''

  const mutation = useMutation({
    mutationFn: (teacherId: string) =>
      classService.update(cls._id, { teacherId: teacherId || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'classes'] })
      setMsg('Đã lưu')
      setSaving(false)
      setTimeout(() => setMsg(''), 2000)
    },
    onError: () => {
      setMsg('Lỗi, thử lại')
      setSaving(false)
    },
  })

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSaving(true)
    setMsg('')
    mutation.mutate(e.target.value)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={currentId}
        onChange={handleChange}
        disabled={saving}
        className="rounded-xl px-3 py-1.5 text-sm font-semibold"
        style={{ border: `1.5px solid ${C.board}`, color: C.board, minWidth: 180 }}
      >
        <option value="">— Chưa phân công —</option>
        {teachers.map((t) => (
          <option key={t._id} value={t._id}>{t.name} ({t.email})</option>
        ))}
      </select>
      {msg && (
        <span className="text-xs font-semibold" style={{ color: msg === 'Đã lưu' ? '#16A34A' : '#DC2626' }}>
          {msg}
        </span>
      )}
    </div>
  )
}

function EditClassPanel({ cls, onDone }: { cls: ApiClass; onDone: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(cls.name)
  const [status, setStatus] = useState(cls.status)
  const [year, setYear] = useState(cls.academicYear ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setMsg('')
    try {
      await classService.update(cls._id, { name: name.trim(), status, academicYear: year || undefined })
      qc.invalidateQueries({ queryKey: ['admin', 'classes'] })
      setMsg('Đã lưu')
      setTimeout(() => setMsg(''), 2000)
    } catch {
      setMsg('Lỗi, thử lại')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Xóa lớp "${cls.name}"? Dữ liệu lớp này sẽ bị xóa vĩnh viễn.`)) return
    setDeleting(true)
    try {
      await classService.delete(cls._id)
      qc.invalidateQueries({ queryKey: ['admin', 'classes'] })
      onDone()
    } catch {
      setMsg('Lỗi khi xóa')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: '#fff5f5', border: `1px solid ${C.line}` }}>
      <div className="text-xs font-bold" style={{ color: C.muted }}>CHỈNH SỬA LỚP</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Tên lớp</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          />
        </label>
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Trạng thái</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApiClass['status'])}
            className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Năm học</div>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
            className="w-full rounded-lg px-2 py-1.5 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="rounded-xl px-4 py-1.5 text-sm font-bold disabled:opacity-40"
          style={{ background: C.board, color: '#fff' }}
        >
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-xl px-4 py-1.5 text-sm font-bold disabled:opacity-40"
          style={{ background: '#FEE2E2', color: '#DC2626' }}
        >
          {deleting ? 'Đang xóa...' : '🗑 Xóa lớp'}
        </button>
        {msg && (
          <span className="text-xs font-semibold" style={{ color: msg === 'Đã lưu' ? '#16A34A' : '#DC2626' }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  )
}

function CreateClassForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ApiClass['status']>('active')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  const qc = useQueryClient()

  async function handleCreate() {
    if (!name.trim()) { setErr('Vui lòng nhập tên lớp'); return }
    setCreating(true)
    setErr('')
    try {
      await classService.create({ name: name.trim(), status, academicYear: year || undefined })
      qc.invalidateQueries({ queryKey: ['admin', 'classes'] })
      setName('')
      setYear(String(new Date().getFullYear()))
      onCreated()
    } catch {
      setErr('Tạo lớp thất bại, thử lại')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ border: `1.5px solid ${C.board}44`, background: C.board + '05' }}>
      <div className="text-sm font-bold" style={{ color: C.board }}>+ TẠO LỚP MỚI</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Tên lớp *</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Lớp 6A"
            autoFocus
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </label>
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Trạng thái</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApiClass['status'])}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <div style={{ color: C.muted }} className="mb-1">Năm học</div>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2024"
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </label>
      </div>
      {err && <div className="text-xs" style={{ color: '#DC2626' }}>{err}</div>}
      <button
        onClick={handleCreate}
        disabled={creating || !name.trim()}
        className="rounded-xl px-5 py-2 text-sm font-bold disabled:opacity-40"
        style={{ background: C.board, color: '#fff' }}
      >
        {creating ? 'Đang tạo...' : 'Tạo lớp'}
      </button>
    </div>
  )
}

export function AdminClassesPage() {
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const params: Record<string, string> = { page: String(page), limit: '20' }
  if (q) params.q = q
  if (statusFilter) params.status = statusFilter

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'classes', params],
    queryFn: () => classService.list(params),
    placeholderData: (prev) => prev,
  })

  const handleSearch = useCallback((v: string) => {
    setQ(v)
    setPage(1)
  }, [])

  const classes = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.board }}>Quản lý lớp học</h2>
          <p className="text-sm" style={{ color: C.muted }}>{total} lớp trong hệ thống</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-xl px-4 py-2 text-sm font-bold"
          style={{ background: showCreate ? C.line : C.board, color: showCreate ? C.ink : '#fff' }}
        >
          {showCreate ? '✕ Đóng' : '+ Tạo lớp mới'}
        </button>
      </div>

      {showCreate && <CreateClassForm onCreated={() => setShowCreate(false)} />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Tìm tên lớp..."
          className="rounded-xl px-3 py-2 text-sm flex-1 min-w-[160px]"
          style={{ border: `1px solid ${C.line}` }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ border: `1px solid ${C.line}` }}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-10 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
      ) : classes.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: C.muted }}>Không tìm thấy lớp nào.</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {classes.map((cls, i) => {
            const isExpanded = expanded === cls._id
            return (
              <div key={cls._id} style={{ borderTop: i > 0 ? `1px solid ${C.line}` : undefined }}>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ background: isExpanded ? C.board + '06' : i % 2 === 0 ? '#fafafa' : '#fff' }}
                  onClick={() => setExpanded(isExpanded ? null : cls._id)}
                >
                  <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>
                    ▶
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: C.board }}>{cls.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: (STATUS_COLOR[cls.status] ?? C.muted) + '18', color: STATUS_COLOR[cls.status] ?? C.muted }}
                      >
                        {STATUS_LABEL[cls.status] ?? cls.status}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                      GV: <TeacherName teacherId={cls.teacherId} />
                      {' · '}{cls.studentIds.length} học sinh
                      {cls.academicYear && ` · NĂM ${cls.academicYear}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs" style={{ color: C.muted }}>
                    {new Date(cls.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 space-y-4" style={{ background: C.board + '04', borderTop: `1px solid ${C.line}` }}>

                    {/* Assign Teacher */}
                    <div className="rounded-xl p-3 space-y-2" style={{ background: C.board + '08', border: `1px solid ${C.board}22` }}>
                      <div className="text-xs font-bold" style={{ color: C.board }}>PHÂN CÔNG GIÁO VIÊN</div>
                      <AssignTeacher cls={cls} />
                    </div>

                    {/* Edit class */}
                    <EditClassPanel cls={cls} onDone={() => setExpanded(null)} />

                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Meta info */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold" style={{ color: C.muted }}>THÔNG TIN LỚP</div>
                        <MetaRow label="ID" value={cls._id} mono />
                        <MetaRow label="Tối đa HS" value={String(cls.maxStudents)} />
                        {cls.startDate && <MetaRow label="Bắt đầu" value={new Date(cls.startDate).toLocaleDateString('vi-VN')} />}
                        {cls.endDate && <MetaRow label="Kết thúc" value={new Date(cls.endDate).toLocaleDateString('vi-VN')} />}
                      </div>

                      {/* Schedule */}
                      {cls.schedule?.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-xs font-bold" style={{ color: C.muted }}>LỊCH HỌC</div>
                          {cls.schedule.map((s, si) => (
                            <div key={si} className="text-xs rounded-lg px-2 py-1" style={{ background: C.line + '55' }}>
                              {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][s.dayOfWeek]} · {s.startTime}–{s.endTime}
                              {s.room ? ` · Phòng ${s.room}` : ''}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Students */}
                    {cls.studentIds.length > 0 && (
                      <div>
                        <div className="text-xs font-bold mb-1.5" style={{ color: C.muted }}>
                          HỌC SINH ĐÃ ĐĂNG KÝ ({cls.studentIds.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(cls.studentIds as unknown as Array<{ _id: string; name: string } | string>).map((s, si) => (
                            <span key={si} className="rounded-lg px-2 py-0.5 text-xs" style={{ background: C.board + '12', color: C.board }}>
                              {typeof s === 'object' ? s.name : String(s).slice(-6)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
          <span className="text-sm" style={{ color: C.muted }}>Trang {page} / {totalPages}</span>
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

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="shrink-0 font-semibold" style={{ color: C.muted, minWidth: 72 }}>{label}</span>
      <span style={{ color: C.ink, fontFamily: mono ? 'monospace' : undefined, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
