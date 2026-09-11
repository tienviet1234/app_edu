import { useMemo } from 'react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import type { AppData, ClassData } from '@/types'
import { C, scoreColor } from '@/constants/colors'
import { RUBRICS, getClassRubric } from '@/constants/rubrics'
import { round1, daysAgoISO } from '@/utils/format'
import { rankingOf } from '@/business/ranking'
import { sessionScore } from '@/business/scoring'
import { teachingDaysOf } from '@/business/stats'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { ProgressRing } from '@/components/atoms/ProgressRing'
import { isMongoid } from '@/utils/mongoid'

interface DashboardScreenProps {
  data: AppData
  setTab: (tab: string) => void
  setCurrent: (i: number) => void
}

function attendColor(rate: number): string {
  if (rate >= 90) return C.emerald
  if (rate >= 70) return C.gold
  return C.rose
}

/** Điểm TB toàn lớp theo từng ngày (tối đa 8 điểm gần nhất) — dùng vẽ
 *  sparkline xu hướng. Mỗi học sinh có buổi riêng nên gộp theo NGÀY thay
 *  vì theo chỉ số buổi chung. */
function classTrend(cls: ClassData): Array<{ date: string; avg: number }> {
  const r = getClassRubric(cls)
  const byDate = new Map<string, number[]>()
  cls.students.forEach((st) =>
    st.sessions.forEach((s) => {
      const t = sessionScore(s.entry, r)
      if (t === null) return
      const list = byDate.get(s.date) ?? []
      list.push(t)
      byDate.set(s.date, list)
    }),
  )
  return [...byDate.entries()]
    .map(([date, vals]) => ({ date, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8)
}

export function DashboardScreen({ data, setTab, setCurrent }: DashboardScreenProps) {
  const summary = useMemo(() => {
    const totalStudents = data.classes.reduce((a, c) => a + c.students.length, 0)
    const totalSessions = data.classes.reduce((a, c) => a + teachingDaysOf(c), 0)
    const synced = data.classes.filter((c) => isMongoid(c.id)).length
    const last30 = daysAgoISO(30)
    const last60 = daysAgoISO(60)

    const classCards = data.classes.map((cls, i) => {
      const ranking = rankingOf(cls)
      const avg = ranking.length ? ranking.reduce((a, b) => a + b.s.monthTotal, 0) / ranking.length : 0

      const allSessions = cls.students.flatMap((st) => st.sessions)
      const totalEntries = allSessions.length
      const presentCount = allSessions.filter((s) =>
        ['present', 'late', 'excused'].includes(s.entry.attendance),
      ).length
      const attendRate = totalEntries > 0 ? (presentCount / totalEntries) * 100 : 100

      const dueReport = cls.students.some(
        (st) => st.sessions.length > 0 && st.sessions.length % cls.perMonth === 0,
      )

      const lowCount = ranking.filter((r) => r.s.monthTotal < 70).length

      // 30 ngày gần nhất — mỗi học sinh giờ có buổi riêng nên không còn "perMonth
      // buổi cuối cùng" chung được, dùng cửa sổ thời gian thay thế.
      const recentAvg = (() => {
        const rk = rankingOf(cls, undefined, last30)
        return rk.length ? rk.reduce((a, b) => a + b.s.monthTotal, 0) / rk.length : 0
      })()
      // 30 ngày trước đó nữa — mốc so sánh để biết đang tiến bộ hay đi xuống.
      const priorAvg = (() => {
        const rk = rankingOf(cls, last30, last60)
        return rk.length ? rk.reduce((a, b) => a + b.s.monthTotal, 0) / rk.length : 0
      })()

      return {
        cls, i, avg, recentAvg, priorAvg, attendRate, dueReport, lowCount,
        totalSessions: teachingDaysOf(cls), trend: classTrend(cls),
      }
    })

    const dueClasses = classCards.filter((x) => x.dueReport)
    const lowClasses = classCards.filter((x) => x.lowCount > 0)
    const unsyncedClasses = data.classes.filter((c) => !isMongoid(c.id))

    const withRecent = classCards.filter((c) => c.recentAvg > 0)
    const heroAvg = withRecent.length ? withRecent.reduce((a, c) => a + c.recentAvg, 0) / withRecent.length : 0
    const withPrior = classCards.filter((c) => c.priorAvg > 0)
    const heroPrior = withPrior.length ? withPrior.reduce((a, c) => a + c.priorAvg, 0) / withPrior.length : 0
    const heroDelta = withRecent.length && withPrior.length ? heroAvg - heroPrior : null

    return {
      totalStudents, totalSessions, synced, classCards, dueClasses, lowClasses, unsyncedClasses,
      heroAvg, heroDelta,
    }
  }, [data])

  function go(i: number, tab: string) {
    setCurrent(i)
    setTab(tab)
  }

  const needsAttention = [
    ...summary.dueClasses.map((c) => ({
      key: `due-${c.cls.id}`, icon: '⏰', tone: C.gold,
      text: <><b>{c.cls.name}</b> đã đến kỳ gửi báo cáo cho phụ huynh</>,
      action: () => go(c.i, 'report'),
    })),
    ...summary.lowClasses.map((c) => ({
      key: `low-${c.cls.id}`, icon: '⚠', tone: C.rose,
      text: <><b>{c.cls.name}</b> có {c.lowCount} học sinh điểm dưới 70</>,
      action: () => go(c.i, 'board'),
    })),
    ...summary.unsyncedClasses.map((cls) => {
      const i = data.classes.findIndex((c) => c.id === cls.id)
      return {
        key: `sync-${cls.id}`, icon: '☁', tone: C.muted,
        text: <><b>{cls.name}</b> chưa đồng bộ lên server</>,
        action: () => go(i, 'classes'),
      }
    }),
  ]

  return (
    <div className="space-y-4">
      {/* Hero — trả lời ngay "mọi thứ có ổn không" */}
      <Card className="overflow-hidden" variant="elevated">
        <div className="p-5" style={{ background: C.gradHeader, color: '#fff' }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-70">
                Điểm trung bình · 30 ngày gần đây
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-5xl font-black tabular-nums">
                  {summary.heroAvg > 0 ? round1(summary.heroAvg) : '—'}
                </span>
                {summary.heroDelta !== null && Math.abs(summary.heroDelta) >= 0.5 && (
                  <span
                    className="text-sm font-bold"
                    style={{ color: summary.heroDelta > 0 ? '#6EE7B7' : '#FCA5A5' }}
                  >
                    {summary.heroDelta > 0 ? '↑' : '↓'} {Math.abs(round1(summary.heroDelta))}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs opacity-60">so với 30 ngày trước đó</div>
            </div>
            <div className="flex gap-5">
              {[
                { label: 'Lớp học', value: data.classes.length },
                { label: 'Học sinh', value: summary.totalStudents },
                { label: 'Buổi đã dạy', value: summary.totalSessions },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-2xl font-black tabular-nums">{value}</div>
                  <div className="text-xs opacity-60">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-2.5 text-xs" style={{ color: C.muted }}>
          <span>☁ Đồng bộ Cloud</span>
          <span className="font-bold" style={{ color: summary.synced === data.classes.length ? C.emerald : C.gold }}>
            {summary.synced}/{data.classes.length} lớp
          </span>
        </div>
      </Card>

      {/* Cần chú ý — gộp mọi việc cần làm vào 1 danh sách */}
      <Card className="p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
          Cần chú ý
        </div>
        {needsAttention.length === 0 ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: C.emerald }}>
            <span>✓</span> Mọi thứ đều ổn, không có việc gì cần xử lý ngay.
          </div>
        ) : (
          <div className="space-y-1.5">
            {needsAttention.map((item) => (
              <button
                key={item.key}
                onClick={item.action}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:brightness-95"
                style={{ background: item.tone + '12' }}
              >
                <span className="shrink-0" style={{ color: item.tone }}>{item.icon}</span>
                <span className="flex-1" style={{ color: C.ink }}>{item.text}</span>
                <span style={{ color: C.muted }}>→</span>
              </button>
            ))}
          </div>
        )}
      </Card>

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
          {summary.classCards.map(({ cls, i, avg, attendRate, dueReport, lowCount, totalSessions: clsSessions, trend }) => (
            <Card key={cls.id} className="overflow-hidden" hoverable>
              {/* Class header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ background: C.gradHeader, color: '#fff' }}
              >
                <div className="min-w-0">
                  <div className="truncate font-bold leading-tight">{cls.name}</div>
                  <div className="truncate text-xs opacity-60">
                    {RUBRICS[cls.level].label} · {cls.teacher || 'chưa có GV'}
                    {isMongoid(cls.id) && <span className="ml-1 opacity-80">☁</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="text-2xl font-black tabular-nums"
                    style={{ color: clsSessions > 0 ? scoreColor(avg) : '#fff' }}
                  >
                    {clsSessions > 0 ? round1(avg) : '—'}
                  </div>
                  <div className="text-xs opacity-50">TB lớp</div>
                </div>
              </div>

              {/* Body: ring + stats + sparkline */}
              <div className="flex items-center gap-4 p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
                <ProgressRing value={attendRate} color={attendColor(attendRate)} size={64} strokeWidth={7} />
                <div className="grid flex-1 grid-cols-2 gap-2">
                  <div>
                    <div className="text-base font-bold tabular-nums" style={{ color: C.ink }}>{cls.students.length}</div>
                    <div className="text-xs" style={{ color: C.muted }}>Học sinh</div>
                  </div>
                  <div>
                    <div className="text-base font-bold tabular-nums" style={{ color: C.ink }}>{clsSessions}</div>
                    <div className="text-xs" style={{ color: C.muted }}>Tổng buổi</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs" style={{ color: C.muted }}>Có mặt {Math.round(attendRate)}%</div>
                  </div>
                </div>
                {trend.length > 1 && (
                  <div className="hidden h-12 w-20 shrink-0 sm:block" title="Xu hướng điểm TB gần đây">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                        <Area
                          type="monotone" dataKey="avg" stroke={scoreColor(avg)}
                          fill={scoreColor(avg) + '26'} strokeWidth={2} dot={false} isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Alerts */}
              {(dueReport || lowCount > 0) && (
                <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                  {dueReport && (
                    <span
                      className="rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{ background: C.gold + '28', color: '#7A5A05' }}
                    >
                      ⏰ Đến kỳ gửi báo cáo
                    </span>
                  )}
                  {lowCount > 0 && (
                    <span
                      className="rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{ background: C.rose + '18', color: C.rose }}
                    >
                      ⚠ {lowCount} học sinh điểm dưới 70
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 p-3">
                <Btn kind="solid" className="flex-1" onClick={() => go(i, 'entry')}>
                  ✏️ Nhập điểm
                </Btn>
                <Btn kind="outline-primary" className="flex-1" onClick={() => go(i, 'board')}>
                  🏆 Xếp hạng
                </Btn>
                <Btn kind="ghost" className="flex-1" onClick={() => go(i, 'report')}>
                  📊 Báo cáo
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
