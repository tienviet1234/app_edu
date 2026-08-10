import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { classService, type ApiClass } from '@/services/classes'
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
  if (!teacherId) return <span style={{ color: C.muted }}>—</span>
  if (typeof teacherId === 'object' && 'name' in (teacherId as object)) {
    return <span>{(teacherId as unknown as { name: string }).name}</span>
  }
  return <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>{String(teacherId).slice(-6)}</span>
}

export function AdminClassesPage() {
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

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
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Quản lý lớp học</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          {total} lớp trong hệ thống
        </p>
      </div>

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
                {/* Row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{ background: isExpanded ? C.board + '06' : i % 2 === 0 ? '#fafafa' : '#fff' }}
                  onClick={() => setExpanded(isExpanded ? null : cls._id)}
                >
                  <span
                    className="shrink-0 text-base"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}
                  >
                    ▶
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: C.board }}>{cls.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: (STATUS_COLOR[cls.status] ?? C.muted) + '18',
                          color: STATUS_COLOR[cls.status] ?? C.muted,
                        }}
                      >
                        {STATUS_LABEL[cls.status] ?? cls.status}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                      GV: <TeacherName teacherId={cls.teacherId} />
                      {' · '}
                      {cls.studentIds.length} học sinh
                      {cls.academicYear && ` · NĂM ${cls.academicYear}`}
                    </div>
                  </div>

                  <div className="shrink-0 text-right text-xs" style={{ color: C.muted }}>
                    {new Date(cls.createdAt).toLocaleDateString('vi-VN')}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1" style={{ background: C.board + '04', borderTop: `1px solid ${C.line}` }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Meta info */}
                      <div className="space-y-1.5">
                        <div className="text-xs font-bold" style={{ color: C.muted }}>THÔNG TIN LỚP</div>
                        <MetaRow label="ID" value={cls._id} mono />
                        <MetaRow label="Trạng thái" value={STATUS_LABEL[cls.status] ?? cls.status} />
                        <MetaRow label="Năm học" value={cls.academicYear ?? '—'} />
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

                    {/* Student IDs chip list */}
                    {cls.studentIds.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-bold mb-1.5" style={{ color: C.muted }}>
                          HỌC SINH ĐÃ ĐĂNG KÝ ({cls.studentIds.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(cls.studentIds as unknown as Array<{ _id: string; name: string } | string>).map((s, si) => (
                            <span
                              key={si}
                              className="rounded-lg px-2 py-0.5 text-xs"
                              style={{ background: C.board + '12', color: C.board }}
                            >
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
