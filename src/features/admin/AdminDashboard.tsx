import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'

const ATTEND_LABEL: Record<string, string> = {
  present: 'Có mặt',
  late: 'Đi muộn',
  excused: 'Có phép',
  absent: 'Vắng',
}

export function AdminDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminService.getOverview,
    staleTime: 60_000,
  })

  if (isLoading) return <Skeleton />
  if (isError || !data) return <Err />

  const { totals, attendance } = data
  const totalAttend = attendance.reduce((a, b) => a + b.count, 0)

  const TILES = [
    { label: 'Giáo viên', value: totals.teachers, icon: '👩‍🏫' },
    { label: 'Học sinh', value: totals.students, icon: '🎓' },
    { label: 'Phụ huynh', value: totals.parents, icon: '👨‍👩‍👧' },
    { label: 'Khóa học', value: totals.courses, icon: '📚' },
    { label: 'Buổi học', value: totals.sessions, icon: '📅' },
    { label: 'Báo cáo', value: totals.reports, icon: '📊' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Tổng quan hệ thống</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>Dữ liệu thực tế từ MongoDB</p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {TILES.map(({ label, value, icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-2xl font-black tabular-nums" style={{ color: C.board }}>
                  {value.toLocaleString('vi')}
                </div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: C.muted }}>{label}</div>
              </div>
              <span className="text-2xl opacity-70">{icon}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Attendance breakdown */}
      {totalAttend > 0 && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-bold" style={{ color: C.muted }}>
            THỐNG KÊ ĐIỂM DANH (TOÀN HỆ THỐNG)
          </div>
          <div className="space-y-2">
            {attendance.map(({ status, count }) => {
              const pct = Math.round((count / totalAttend) * 100)
              const color =
                status === 'present' ? C.board2
                : status === 'late' ? C.gold
                : status === 'excused' ? C.blue
                : C.red
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: C.ink }}>{ATTEND_LABEL[status] ?? status}</span>
                    <span className="font-semibold tabular-nums" style={{ color }}>
                      {count.toLocaleString('vi')} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="pt-1 text-xs" style={{ color: C.muted }}>
              Tổng: {totalAttend.toLocaleString('vi')} lượt
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: C.line, height: 80 }} />
      ))}
    </div>
  )
}

function Err() {
  return (
    <div className="rounded-2xl p-8 text-center" style={{ background: C.paper, color: C.red }}>
      Không thể tải dữ liệu. Server đang chạy không?
    </div>
  )
}
