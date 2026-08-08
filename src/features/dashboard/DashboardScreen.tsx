import { useMemo } from 'react'
import type { AppData } from '@/types'
import { C } from '@/constants/colors'
import { RUBRICS } from '@/constants/rubrics'
import { round1 } from '@/utils/format'
import { rankingOf } from '@/business/ranking'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { isMongoid } from '@/utils/mongoid'

interface DashboardScreenProps {
  data: AppData
  setTab: (tab: string) => void
  setCurrent: (i: number) => void
}

export function DashboardScreen({ data, setTab, setCurrent }: DashboardScreenProps) {
  const summary = useMemo(() => {
    const totalStudents = data.classes.reduce((a, c) => a + c.students.length, 0)
    const totalSessions = data.classes.reduce((a, c) => a + c.sessions.length, 0)
    const synced = data.classes.filter((c) => isMongoid(c.id)).length

    const classCards = data.classes.map((cls, i) => {
      const ranking = rankingOf(cls)
      const avg = ranking.length ? ranking.reduce((a, b) => a + b.s.monthTotal, 0) / ranking.length : 0

      const totalEntries = cls.students.length * cls.sessions.length
      const presentCount = cls.sessions.reduce(
        (a, s) =>
          a +
          cls.students.filter((st) =>
            ['present', 'late', 'excused'].includes(s.entries[st.id]?.attendance ?? 'absent'),
          ).length,
        0,
      )
      const attendRate = totalEntries > 0 ? (presentCount / totalEntries) * 100 : 100

      const dueReport =
        cls.sessions.length > 0 &&
        (cls.perMonth === 8 ? cls.sessions.length % 8 === 0 : cls.sessions.length % 6 === 0)

      const lowCount = ranking.filter((r) => r.s.monthTotal < 70).length

      // This month's sessions (last perMonth or fewer)
      const recentSessions = cls.sessions.slice(-cls.perMonth)
      const recentAvg =
        recentSessions.length > 0
          ? (() => {
              const rk = rankingOf({ ...cls, sessions: recentSessions })
              return rk.length ? rk.reduce((a, b) => a + b.s.monthTotal, 0) / rk.length : 0
            })()
          : 0

      return { cls, i, avg, recentAvg, attendRate, dueReport, lowCount }
    })

    const dueClasses = classCards.filter((x) => x.dueReport)

    return { totalStudents, totalSessions, synced, classCards, dueClasses }
  }, [data])

  function go(i: number, tab: string) {
    setCurrent(i)
    setTab(tab)
  }

  return (
    <div className="space-y-4">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Lớp học', value: data.classes.length, color: C.board },
          { label: 'Học sinh', value: summary.totalStudents, color: C.board },
          { label: 'Buổi đã dạy', value: summary.totalSessions, color: C.board },
          { label: 'Đồng bộ Cloud', value: summary.synced, color: summary.synced === data.classes.length ? C.board2 : C.muted },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <div className="text-3xl font-black tabular-nums" style={{ color }}>
              {value}
            </div>
            <div className="mt-0.5 text-xs font-medium" style={{ color: C.muted }}>
              {label}
            </div>
          </Card>
        ))}
      </div>

      {/* Due report alert */}
      {summary.dueClasses.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{ background: C.gold + '28', border: `1.5px solid ${C.gold}` }}
        >
          <div className="mb-2 text-sm font-bold" style={{ color: '#7A5A05' }}>
            ⏰ Đến kỳ gửi báo cáo cho phụ huynh
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.dueClasses.map(({ cls, i }) => (
              <button
                key={cls.id}
                onClick={() => go(i, 'report')}
                className="rounded-xl px-4 py-1.5 text-sm font-bold"
                style={{ background: C.gold, color: '#2A1F05' }}
              >
                {cls.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Class cards */}
      {data.classes.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-4xl mb-3">🏫</div>
          <div className="font-bold" style={{ color: C.ink }}>Chưa có lớp học nào</div>
          <div className="text-sm mt-1 mb-4" style={{ color: C.muted }}>
            Tạo lớp đầu tiên để bắt đầu quản lý học sinh
          </div>
          <Btn kind="solid" onClick={() => setTab('classes')}>+ Tạo lớp học</Btn>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.classCards.map(({ cls, i, avg, attendRate, dueReport, lowCount }) => (
            <Card key={cls.id} className="overflow-hidden">
              {/* Class header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: C.board, color: '#fff' }}
              >
                <div>
                  <div className="font-bold leading-tight">{cls.name}</div>
                  <div className="text-xs opacity-60">
                    {RUBRICS[cls.level].label} · {cls.teacher || 'chưa có GV'}
                    {isMongoid(cls.id) && <span className="ml-1 opacity-80">☁</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-2xl font-black tabular-nums"
                    style={{
                      color:
                        avg >= 80 ? '#7EE8B4' : avg >= 65 ? '#fff' : '#FFB2A8',
                    }}
                  >
                    {cls.sessions.length > 0 ? round1(avg) : '—'}
                  </div>
                  <div className="text-xs opacity-50">TB lớp</div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 divide-x" style={{ borderBottom: `1px solid ${C.line}` }}>
                {[
                  { label: 'Học sinh', val: cls.students.length },
                  { label: `Buổi (${cls.perMonth}/kỳ)`, val: `${cls.sessions.length}/${cls.perMonth}` },
                  {
                    label: 'Có mặt',
                    val: `${Math.round(attendRate)}%`,
                    color: attendRate >= 90 ? C.board2 : attendRate >= 70 ? C.ink : C.red,
                  },
                ].map(({ label, val, color }) => (
                  <div key={label} className="p-3 text-center">
                    <div className="text-base font-bold tabular-nums" style={{ color: color ?? C.ink }}>
                      {val}
                    </div>
                    <div className="text-xs" style={{ color: C.muted }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Alerts */}
              {(dueReport || lowCount > 0) && (
                <div className="px-4 py-2 space-y-1">
                  {dueReport && (
                    <div
                      className="rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{ background: C.gold + '28', color: '#7A5A05' }}
                    >
                      ⏰ Đến kỳ gửi báo cáo
                    </div>
                  )}
                  {lowCount > 0 && (
                    <div
                      className="rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{ background: C.red + '18', color: C.red }}
                    >
                      ⚠ {lowCount} học sinh điểm dưới 70
                    </div>
                  )}
                </div>
              )}

              {/* Attendance bar */}
              {cls.sessions.length > 0 && (
                <div className="px-4 pb-1">
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: C.line }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${attendRate}%`,
                        background: attendRate >= 90 ? C.board2 : attendRate >= 70 ? C.gold : C.red,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 p-3">
                <Btn kind="solid" className="flex-1" onClick={() => go(i, 'entry')}>
                  Nhập điểm
                </Btn>
                <Btn kind="ghost" className="flex-1" onClick={() => go(i, 'board')}>
                  Xếp hạng
                </Btn>
                <Btn kind="ghost" className="flex-1" onClick={() => go(i, 'report')}>
                  Báo cáo
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
