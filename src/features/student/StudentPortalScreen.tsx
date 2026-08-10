import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { classService } from '@/services/classes'
import { scoreService } from '@/services/scores'
import { reportService } from '@/services/reports'
import { C } from '@/constants/colors'

const ATT_COLOR: Record<string, string> = {
  present: '#16A34A',
  late: '#D97706',
  excused: '#2563EB',
  absent: '#DC2626',
}
const ATT_LABEL: Record<string, string> = {
  present: 'Có mặt',
  late: 'Muộn',
  excused: 'Phép',
  absent: 'Vắng',
}
const ATT_DOT: Record<string, string> = {
  present: '●',
  late: '◑',
  excused: '○',
  absent: '✕',
}

function StatCard({ icon, value, label, loading }: { icon: string; value: string; label: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-0.5" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
      <div className="text-xl">{icon}</div>
      <div className="text-2xl font-black tabular-nums mt-0.5" style={{ color: C.board }}>
        {loading ? '...' : value}
      </div>
      <div className="text-xs" style={{ color: C.muted }}>{label}</div>
    </div>
  )
}

export function StudentPortalScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: classData, isLoading: clsLoading } = useQuery({
    queryKey: ['student-portal', 'classes'],
    queryFn: () => classService.list({ limit: '50' }),
  })

  const { data: scoreData, isLoading: scoresLoading } = useQuery({
    queryKey: ['student-portal', 'scores', selectedId],
    queryFn: () => scoreService.list({ classId: selectedId!, limit: '100', sort: 'createdAt', order: 'asc' }),
    enabled: !!selectedId,
  })

  const { data: reportData } = useQuery({
    queryKey: ['student-portal', 'reports'],
    queryFn: () => reportService.list({ status: 'published', limit: '20' }),
  })

  const classes = classData?.items ?? []
  const scores = scoreData?.items ?? []
  const reports = reportData?.items ?? []

  const presentScores = scores.filter((s) => s.attendance === 'present' || s.attendance === 'late')
  const avgScore = presentScores.length
    ? Math.round(presentScores.reduce((a, s) => a + s.total, 0) / presentScores.length)
    : null
  const attendRate = scores.length ? Math.round((presentScores.length / scores.length) * 100) : null
  const maxScore = scores.length ? Math.max(...scores.map((s) => s.total)) : null

  if (clsLoading) {
    return <div className="text-center py-12 text-sm" style={{ color: C.muted }}>Đang tải...</div>
  }

  if (!classes.length) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="text-6xl">📚</div>
        <div className="text-lg font-black" style={{ color: C.board }}>Bạn chưa tham gia lớp nào</div>
        <p className="text-sm max-w-xs mx-auto leading-relaxed" style={{ color: C.muted }}>
          Nhờ giáo viên cung cấp mã tham gia lớp, sau đó bấm <strong>+ Tham gia lớp</strong> ở trên cùng.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Điểm của tôi</h2>
        <p className="text-sm" style={{ color: C.muted }}>Kết quả học tập từ giáo viên — dữ liệu thực từ máy chủ</p>
      </div>

      {/* Class selector */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((cls) => {
          const active = selectedId === cls._id
          const teacher = typeof cls.teacherId === 'object' && cls.teacherId !== null
            ? (cls.teacherId as unknown as { name: string }).name
            : ''
          return (
            <button
              key={cls._id}
              onClick={() => setSelectedId(active ? null : cls._id)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                border: `2px solid ${active ? C.board : C.line}`,
                background: active ? C.board + '08' : '#fff',
              }}
            >
              <div className="font-black text-sm" style={{ color: active ? C.board : C.ink }}>
                {cls.name}
              </div>
              {teacher && (
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>GV: {teacher}</div>
              )}
              <div
                className="text-[10px] mt-1 rounded-full px-2 py-0.5 inline-block font-semibold"
                style={{
                  background: cls.status === 'active' ? '#DCFCE7' : '#F3F4F6',
                  color: cls.status === 'active' ? '#15803D' : C.muted,
                }}
              >
                {cls.status === 'active' ? 'Đang học' : cls.status === 'completed' ? 'Đã kết thúc' : cls.status}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected class detail */}
      {selectedId && (
        <div className="space-y-4">
          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon="📅" value={String(scores.length)} label="Số buổi học" loading={scoresLoading} />
            <StatCard icon="✅" value={attendRate !== null ? `${attendRate}%` : '—'} label="Tỉ lệ có mặt" loading={scoresLoading} />
            <StatCard icon="⭐" value={avgScore !== null ? String(avgScore) : '—'} label="Điểm trung bình" loading={scoresLoading} />
            <StatCard icon="🏆" value={maxScore !== null ? String(maxScore) : '—'} label="Điểm cao nhất" loading={scoresLoading} />
          </div>

          {/* Attendance dots timeline */}
          {!scoresLoading && scores.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
              <div className="text-xs font-bold mb-3" style={{ color: C.muted }}>LỊCH SỬ ĐIỂM DANH</div>
              <div className="flex flex-wrap gap-2">
                {scores.map((s, i) => (
                  <div key={s._id} className="flex flex-col items-center gap-0.5" title={ATT_LABEL[s.attendance]}>
                    <span
                      className="text-base leading-none"
                      style={{ color: ATT_COLOR[s.attendance] ?? C.muted }}
                    >
                      {ATT_DOT[s.attendance] ?? '●'}
                    </span>
                    <span className="text-[9px]" style={{ color: C.muted }}>{i + 1}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 mt-3">
                {Object.entries(ATT_LABEL).map(([k, v]) => (
                  <span key={k} className="text-[10px] flex items-center gap-1" style={{ color: C.muted }}>
                    <span style={{ color: ATT_COLOR[k] }}>{ATT_DOT[k]}</span> {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Score table */}
          {!scoresLoading && scores.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
              <div className="px-4 py-2.5 text-xs font-bold" style={{ background: C.board, color: '#fff' }}>
                CHI TIẾT TỪNG BUỔI HỌC
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: C.paper }}>
                      <th className="py-2 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>Buổi</th>
                      <th className="py-2 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>Điểm danh</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold" style={{ color: C.muted }}>Điểm</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold" style={{ color: C.muted }}>Ngày</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, i) => (
                      <tr key={s._id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td className="py-2.5 px-4 font-semibold tabular-nums text-sm" style={{ color: C.board }}>
                          {i + 1}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              background: (ATT_COLOR[s.attendance] ?? C.muted) + '18',
                              color: ATT_COLOR[s.attendance] ?? C.muted,
                            }}
                          >
                            {ATT_LABEL[s.attendance] ?? s.attendance}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-black tabular-nums" style={{ color: s.attendance === 'absent' ? C.muted : C.board }}>
                          {s.attendance === 'absent' ? '—' : s.total}
                        </td>
                        <td className="py-2.5 px-4 text-right text-xs" style={{ color: C.muted }}>
                          {new Date(s.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!scoresLoading && scores.length === 0 && (
            <div className="rounded-2xl p-10 text-center" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
              <div className="text-4xl mb-2">📝</div>
              <div className="text-sm" style={{ color: C.muted }}>Giáo viên chưa nhập điểm cho lớp này.</div>
            </div>
          )}
        </div>
      )}

      {/* Published reports */}
      {reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-sm" style={{ color: C.board }}>Báo cáo học tập đã nhận</h3>
          {reports.map((r) => (
            <div key={r._id} className="rounded-2xl p-4 space-y-2" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black text-sm" style={{ color: C.board }}>{r.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.muted }}>Kỳ {r.period.label}</div>
                </div>
                {r.score !== undefined && (
                  <div className="text-2xl font-black tabular-nums shrink-0" style={{ color: C.board }}>
                    {r.score}
                  </div>
                )}
              </div>
              {r.summary && (
                <p className="text-sm leading-relaxed" style={{ color: C.ink }}>{r.summary}</p>
              )}
              {!!r.strengths?.length && (
                <div className="rounded-xl p-2.5 text-xs" style={{ background: '#F0FDF4' }}>
                  <span className="font-bold" style={{ color: '#15803D' }}>Điểm mạnh: </span>
                  <span style={{ color: '#166534' }}>{r.strengths.join(' · ')}</span>
                </div>
              )}
              {!!r.improvements?.length && (
                <div className="rounded-xl p-2.5 text-xs" style={{ background: '#FFFBEB' }}>
                  <span className="font-bold" style={{ color: '#92400E' }}>Cần cải thiện: </span>
                  <span style={{ color: '#78350F' }}>{r.improvements.join(' · ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
