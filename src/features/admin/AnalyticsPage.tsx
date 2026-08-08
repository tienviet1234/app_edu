import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from 'recharts'
import { adminService } from '@/services/admin'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'

type Tab = 'attendance' | 'heatmap' | 'teachers'

// ── Colour helpers ────────────────────────────────────────────────────────────
function scoreColor(v: number | null): string {
  if (v === null) return C.line
  if (v >= 85)   return '#1E6B47'
  if (v >= 70)   return C.board2
  if (v >= 55)   return C.gold
  return C.red
}
function scoreTextColor(v: number | null): string {
  if (v === null) return C.muted
  if (v >= 70)   return '#fff'
  if (v >= 55)   return '#2A1F05'
  return '#fff'
}

// ── Tab: Xu hướng điểm danh ──────────────────────────────────────────────────
function AttendanceTrendTab() {
  const [classId] = useState('')
  const [limit, setLimit] = useState('20')

  const params: Record<string, string> = { limit }
  if (classId) params.classId = classId

  const { data = [], isLoading } = useQuery({
    queryKey: ['analytics', 'attendance-trend', params],
    queryFn: () => adminService.getAttendanceTrend(params),
    staleTime: 60_000,
  })

  const chartData = data.map((r) => ({
    name: `B${r.session}`,
    'Có mặt (%)': r.attendRate,
    'Vắng': r.absent,
    'Điểm TB': r.avgScore ?? 0,
  }))

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: C.muted }}>Buổi gần nhất:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="rounded-xl px-3 py-1.5"
            style={{ border: `1px solid ${C.line}` }}
          >
            <option value="10">10 buổi</option>
            <option value="20">20 buổi</option>
            <option value="40">40 buổi</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</Card>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-3xl mb-2">📅</div>
          <div className="text-sm" style={{ color: C.muted }}>Chưa có dữ liệu điểm danh.</div>
        </Card>
      ) : (
        <>
          {/* Attendance rate line */}
          <Card className="p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              TỈ LỆ CÓ MẶT THEO TỪNG BUỔI (%)
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="Có mặt (%)"
                    stroke={C.board2}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Score avg line */}
          <Card className="p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              ĐIỂM TRUNG BÌNH THEO BUỔI
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="Điểm TB"
                    stroke={C.gold}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Absent bar */}
          <Card className="p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              SỐ HỌC SINH VẮNG THEO BUỔI
            </div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip />
                  <Bar dataKey="Vắng" fill={C.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Summary table */}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['Buổi', 'Ngày', 'Có mặt', 'Đi muộn', 'Có phép', 'Vắng', 'Tỉ lệ', 'Điểm TB'].map((h) => (
                    <th key={h} className="py-2 px-3 text-left text-xs font-semibold" style={{ color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2 px-3 font-bold tabular-nums">{r.label}</td>
                    <td className="py-2 px-3 text-xs tabular-nums" style={{ color: C.muted }}>
                      {r.date ?? '—'}
                    </td>
                    <td className="py-2 px-3 tabular-nums" style={{ color: C.board2 }}>{r.present}</td>
                    <td className="py-2 px-3 tabular-nums" style={{ color: C.gold }}>{r.late}</td>
                    <td className="py-2 px-3 tabular-nums" style={{ color: '#2E5E8C' }}>{r.excused}</td>
                    <td className="py-2 px-3 tabular-nums" style={{ color: C.red }}>{r.absent}</td>
                    <td className="py-2 px-3 tabular-nums font-bold">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: r.attendRate >= 90 ? C.board2 + '22' : r.attendRate >= 75 ? C.gold + '33' : C.red + '20',
                          color: r.attendRate >= 90 ? C.board2 : r.attendRate >= 75 ? '#7A5A05' : C.red,
                        }}
                      >
                        {r.attendRate}%
                      </span>
                    </td>
                    <td className="py-2 px-3 tabular-nums" style={{ color: C.ink }}>
                      {r.avgScore ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}

// ── Tab: Score Heatmap ────────────────────────────────────────────────────────
function ScoreHeatmapTab() {
  const [classId, setClassId] = useState('')

  const { data: heatmap, isLoading } = useQuery({
    queryKey: ['analytics', 'score-heatmap', classId],
    queryFn: () => adminService.getScoreHeatmap(classId),
    enabled: !!classId,
    staleTime: 60_000,
  })

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <span className="text-sm" style={{ color: C.muted }}>Chọn lớp:</span>
        <input
          type="text"
          value={classId}
          onChange={(e) => setClassId(e.target.value.trim())}
          placeholder="Dán Class ID vào đây..."
          className="flex-1 min-w-0 rounded-xl px-3 py-1.5 text-sm font-mono"
          style={{ border: `1px solid ${C.line}` }}
        />
      </Card>

      {!classId ? (
        <Card className="p-8 text-center">
          <div className="text-3xl mb-2">🔥</div>
          <div className="text-sm" style={{ color: C.muted }}>Nhập Class ID để xem heatmap điểm số.</div>
        </Card>
      ) : isLoading ? (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</Card>
      ) : !heatmap || heatmap.sessions.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-sm" style={{ color: C.muted }}>Không có dữ liệu cho lớp này.</div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-2">
          <div className="mb-3 px-2">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              MA TRẬN ĐIỂM — {heatmap.students.length} học sinh × {heatmap.sessions.length} buổi
            </div>
            <div className="mt-1 flex gap-4 text-xs" style={{ color: C.muted }}>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: '#1E6B47' }} />≥85</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: C.board2 }} />70–84</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: C.gold }} />55–69</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: C.red }} />&lt;55</span>
              <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ background: C.line }} />Vắng</span>
            </div>
          </div>

          <table className="text-xs border-collapse" style={{ minWidth: `${heatmap.sessions.length * 38 + 160}px` }}>
            <thead>
              <tr>
                <th className="py-1 px-2 text-left font-semibold sticky left-0 bg-white z-10" style={{ color: C.muted, minWidth: 140 }}>
                  Học sinh
                </th>
                {heatmap.sessions.map((s) => (
                  <th
                    key={s._id}
                    className="py-1 px-1 text-center font-semibold"
                    style={{ color: C.muted, minWidth: 34 }}
                    title={s.date}
                  >
                    B{s.no}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.students.map((st) => (
                <tr key={st._id}>
                  <td
                    className="py-1 px-2 font-semibold sticky left-0 z-10 truncate"
                    style={{ color: C.ink, maxWidth: 140, background: C.card }}
                  >
                    {st.name}
                  </td>
                  {heatmap.sessions.map((s) => {
                    const v = heatmap.cells[st._id]?.[s._id] ?? null
                    return (
                      <td key={s._id} className="py-1 px-0.5 text-center">
                        <div
                          className="rounded-md w-7 h-7 mx-auto flex items-center justify-center font-bold tabular-nums"
                          style={{
                            background: scoreColor(v),
                            color: scoreTextColor(v),
                            fontSize: 10,
                          }}
                          title={v !== null ? `${st.name}: ${v}đ` : `${st.name}: Vắng`}
                        >
                          {v !== null ? v : '—'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ── Tab: Hiệu quả giáo viên ───────────────────────────────────────────────────
function TeacherPerfTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['analytics', 'teacher-performance'],
    queryFn: adminService.getTeacherPerformance,
    staleTime: 120_000,
  })

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</Card>
      ) : data.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-3xl mb-2">👨‍🏫</div>
          <div className="text-sm" style={{ color: C.muted }}>Chưa có dữ liệu giáo viên.</div>
        </Card>
      ) : (
        <>
          {/* Avg score bar chart */}
          <Card className="p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              ĐIỂM TRUNG BÌNH HỌC SINH THEO GIÁO VIÊN
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.map((r) => ({ name: r.teacher.name.split(' ').at(-1), avg: r.avgScore }))}
                  margin={{ top: 5, right: 16, left: -20, bottom: 0 }}
                >
                  <CartesianGrid stroke={C.line} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip />
                  <Bar dataKey="avg" name="Điểm TB" fill={C.board2} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Table */}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['#', 'Giáo viên', 'Số lớp', 'Số điểm nhập', 'Báo cáo đã gửi', 'Điểm TB HS'].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={r.teacher._id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2.5 px-4 tabular-nums font-bold" style={{ color: C.muted }}>
                      {i + 1}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-semibold" style={{ color: C.ink }}>{r.teacher.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{r.teacher.email}</div>
                    </td>
                    <td className="py-2.5 px-4 tabular-nums">{r.classCount}</td>
                    <td className="py-2.5 px-4 tabular-nums">{r.scoreCount.toLocaleString('vi')}</td>
                    <td className="py-2.5 px-4 tabular-nums">{r.reportCount}</td>
                    <td className="py-2.5 px-4">
                      {r.avgScore !== null ? (
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums"
                          style={{
                            background: scoreColor(r.avgScore) + '25',
                            color: r.avgScore >= 70 ? scoreColor(r.avgScore) : C.red,
                          }}
                        >
                          {r.avgScore}
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
const TABS: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'attendance', label: 'Xu hướng điểm danh', icon: '📅' },
  { key: 'heatmap',    label: 'Heatmap điểm số',    icon: '🔥' },
  { key: 'teachers',  label: 'Hiệu quả giáo viên',  icon: '👨‍🏫' },
]

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('attendance')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Phân tích & Thống kê</h1>
        <p className="mt-0.5 text-sm" style={{ color: C.muted }}>
          Xu hướng điểm danh, ma trận điểm số, hiệu quả giảng dạy.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
            style={{
              background: tab === t.key ? C.board : C.paper,
              color: tab === t.key ? '#fff' : C.ink,
              border: `1px solid ${tab === t.key ? C.board : C.line}`,
            }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'attendance' && <AttendanceTrendTab />}
      {tab === 'heatmap'    && <ScoreHeatmapTab />}
      {tab === 'teachers'   && <TeacherPerfTab />}
    </div>
  )
}
