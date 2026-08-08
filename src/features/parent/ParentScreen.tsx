import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getRubric } from '@/constants/rubrics'
import { round1, viDate } from '@/utils/format'
import { statsOf } from '@/business/stats'
import { rankingOf } from '@/business/ranking'
import { detailBlocks, buildComment, periodsOf } from '@/business/report'
import { Card } from '@/components/atoms/Card'
import { Stat } from '@/components/atoms/Stat'
import { isMongoid } from '@/utils/mongoid'
import { useClassDetail, useStudentReports } from '@/hooks'

interface ParentScreenProps {
  cls: ClassData
}

const ATTEND_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  present: { label: 'P', bg: C.board2 + '22', color: C.board2 },
  late:    { label: 'M', bg: C.gold + '33',   color: '#7A5A05' },
  excused: { label: 'P*', bg: C.blue + '22',  color: C.blue },
  absent:  { label: 'V', bg: C.red + '20',    color: C.red },
}

const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function ParentScreen({ cls }: ParentScreenProps) {
  const r = getRubric(cls.level)
  const periods = periodsOf(cls)
  const [stIdx, setStIdx] = useState(0)
  const [pIdx, setPIdx] = useState(Math.max(0, periods.length - 1))
  const [showReports, setShowReports] = useState(false)

  const st = cls.students[stIdx]
  if (!st) return <Card className="p-6 text-center">Lớp chưa có học sinh.</Card>

  const p = periods[Math.min(pIdx, periods.length - 1)] ?? { from: 0, to: cls.sessions.length, label: 'Hiện tại' }
  const pPrev = pIdx > 0 ? periods[pIdx - 1] : null

  const s = statsOf(cls, st.id, p.from, p.to)
  const sPrev = pPrev ? statsOf(cls, st.id, pPrev.from, pPrev.to) : null
  const place = rankingOf(cls, p.to).find((x) => x.student.id === st.id)?.place
  const blocks = detailBlocks(s, r)

  const delta = sPrev ? round1(s.monthTotal - sPrev.monthTotal) : null
  const dropAlert = delta !== null && delta < -5

  const chart = s.totals.map((t, k) => ({ name: `B${p.from + k + 1}`, Điểm: t }))
  const bars = r.comps.map((c) => ({
    name: c.label.split(' ')[0],
    pct: Math.round((s.catAvg[c.key] / c.max) * 100),
  }))

  const apiClassId = isMongoid(cls.id) ? cls.id : ''
  const apiStudentId = isMongoid(st.id) ? st.id : ''

  const { data: apiClass } = useClassDetail(apiClassId)
  const { data: reportsData } = useStudentReports(apiClassId, apiStudentId)
  const apiReports = reportsData?.items ?? []
  const published = apiReports.filter((r) => r.status === 'published')

  const attendSessions = cls.sessions.slice(p.from, p.to)

  return (
    <div className="space-y-3">

      {/* Selector bar */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: C.muted }}>Con:</span>
            <select
              value={stIdx}
              onChange={(e) => setStIdx(Number(e.target.value))}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold"
              style={{ border: `1px solid ${C.line}` }}
            >
              {cls.students.map((x, k) => (
                <option key={x.id} value={k}>{x.name}</option>
              ))}
            </select>
          </div>
          {periods.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: C.muted }}>Kỳ:</span>
              <select
                value={pIdx}
                onChange={(e) => setPIdx(Number(e.target.value))}
                className="rounded-xl px-3 py-1.5 text-sm font-semibold"
                style={{ border: `1px solid ${C.line}` }}
              >
                {periods.map((x, k) => (
                  <option key={k} value={k}>{x.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Card>

      {/* Drop alert */}
      {dropAlert && (
        <div
          className="rounded-2xl px-4 py-3 flex items-start gap-3"
          style={{ background: C.red + '15', border: `1.5px solid ${C.red}` }}
        >
          <span className="text-lg">⚠️</span>
          <div>
            <div className="font-bold text-sm" style={{ color: C.red }}>
              Điểm giảm so với kỳ trước
            </div>
            <div className="text-sm mt-0.5" style={{ color: C.ink }}>
              {st.name} giảm <b>{Math.abs(Number(delta))} điểm</b> so với {pPrev?.label}.
              Hãy liên hệ giáo viên để trao đổi thêm.
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {r.comps.map((c) => (
          <Stat
            key={c.key}
            label={c.label}
            value={`${round1(s.catAvg[c.key])}/${c.max}`}
            color={s.catAvg[c.key] >= c.max * 0.9 ? C.board2 : s.catAvg[c.key] >= c.max * 0.7 ? C.ink : C.red}
          />
        ))}
        <Stat
          label="Chuyên cần"
          value={`${round1(s.attendScore)}/10`}
          sub={s.absent ? `Vắng ${s.absent} buổi` : 'Đầy đủ'}
        />
        <Stat
          label="Tổng điểm"
          value={`${round1(s.monthTotal)}/100`}
          color={C.board2}
          sub={
            delta !== null
              ? `Top ${place}/${cls.students.length} · ${delta >= 0 ? '+' : ''}${delta} so kỳ trước`
              : `Top ${place}/${cls.students.length}`
          }
        />
      </div>

      {/* Attendance calendar */}
      {attendSessions.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
            ĐIỂM DANH ({attendSessions.length} BUỔI)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attendSessions.map((ss) => {
              const att = ss.entries[st.id]?.attendance ?? 'absent'
              const style = ATTEND_STYLE[att] ?? ATTEND_STYLE.absent
              return (
                <div
                  key={ss.id}
                  className="flex flex-col items-center rounded-xl px-2 py-1.5"
                  style={{ background: style.bg, minWidth: 40 }}
                  title={`Buổi ${ss.no} · ${viDate(ss.date)}`}
                >
                  <span className="text-xs font-black" style={{ color: style.color }}>
                    {style.label}
                  </span>
                  <span className="text-[10px]" style={{ color: C.muted }}>B{ss.no}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: C.muted }}>
            {Object.entries(ATTEND_STYLE).map(([k, v]) => (
              <span key={k}>
                <span className="font-bold" style={{ color: v.color }}>{v.label}</span>
                {' '}{k === 'present' ? 'Có mặt' : k === 'late' ? 'Đi muộn' : k === 'excused' ? 'Có phép' : 'Vắng không phép'}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Score chart */}
      {chart.length > 1 && (
        <Card className="p-3">
          <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>TIẾN BỘ QUA TỪNG BUỔI</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11, fill: C.muted }} />
                <Tooltip />
                <Line type="monotone" dataKey="Điểm" stroke={C.board2} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Component bars */}
      <Card className="p-3">
        <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>MỨC ĐỘ ĐẠT THEO TỪNG PHẦN (%)</div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.muted }} />
              <Tooltip />
              <Bar dataKey="pct" name="%" radius={[6, 6, 0, 0]}>
                {bars.map((b, k) => (
                  <Cell key={k} fill={b.pct >= 90 ? C.board2 : b.pct >= 75 ? C.gold : C.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detail blocks */}
      <Card className="p-3">
        <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>CON MẠNH VÀ YẾU Ở ĐÂU</div>
        <div className="space-y-2">
          {blocks.map((b) => (
            <div key={b.title} className="rounded-xl p-3" style={{ background: C.paper }}>
              <div className="font-bold">{b.icon} {b.title}</div>
              <ul className="mt-1 space-y-0.5">
                {b.lines.map((l, k) => (
                  <li key={k} className="text-sm">• {l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* Teacher comment */}
      <Card className="p-3">
        <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>NHẬN XÉT CỦA GIÁO VIÊN</div>
        <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: C.paper }}>
          {cls.comments?.[`${st.id}:${p.from}-${p.to}`]
            ?? cls.comments?.[`${st.id}:0-${cls.sessions.length}`]
            ?? buildComment(st.name, s, r)}
        </div>
      </Card>

      {/* Class schedule (from API) */}
      {apiClass && apiClass.schedule.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>LỊCH HỌC</div>
          <div className="flex flex-wrap gap-2">
            {apiClass.schedule.map((sch, k) => (
              <div
                key={k}
                className="rounded-xl px-3 py-2 text-sm"
                style={{ background: C.board + '0D', border: `1px solid ${C.board}22` }}
              >
                <span className="font-bold" style={{ color: C.board }}>
                  {DAYS_VI[sch.dayOfWeek] ?? `Ngày ${sch.dayOfWeek}`}
                </span>
                {' · '}
                <span style={{ color: C.ink }}>{sch.startTime}–{sch.endTime}</span>
                {sch.room && (
                  <span style={{ color: C.muted }}> · {sch.room}</span>
                )}
              </div>
            ))}
          </div>
          {apiClass.startDate && (
            <div className="mt-2 text-xs" style={{ color: C.muted }}>
              Bắt đầu: {viDate(apiClass.startDate.slice(0, 10))}
              {apiClass.endDate && ` · Kết thúc: ${viDate(apiClass.endDate.slice(0, 10))}`}
            </div>
          )}
        </Card>
      )}

      {/* API reports */}
      {apiStudentId && (
        <Card className="p-3">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setShowReports(!showReports)}
          >
            <div className="text-xs font-bold" style={{ color: C.muted }}>
              BÁO CÁO ĐÃ GỬI ({published.length})
            </div>
            <span className="text-xs" style={{ color: C.muted }}>{showReports ? '▲ Thu gọn' : '▼ Xem báo cáo'}</span>
          </button>

          {showReports && (
            <div className="mt-3 space-y-3">
              {published.length === 0 ? (
                <div className="rounded-xl p-4 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
                  Giáo viên chưa gửi báo cáo nào.
                </div>
              ) : (
                published.map((rpt) => (
                  <div key={rpt._id} className="rounded-xl p-3" style={{ background: C.paper }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm">{rpt.period.label}</div>
                      {rpt.score !== undefined && (
                        <div
                          className="rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums"
                          style={{
                            background: rpt.score >= 80 ? C.board2 + '22' : rpt.score >= 65 ? C.gold + '33' : C.red + '20',
                            color: rpt.score >= 80 ? C.board2 : rpt.score >= 65 ? '#7A5A05' : C.red,
                          }}
                        >
                          {rpt.score}/100
                        </div>
                      )}
                    </div>
                    {rpt.comment && (
                      <div className="mt-2 text-sm leading-relaxed" style={{ color: C.ink }}>
                        {rpt.comment}
                      </div>
                    )}
                    {rpt.strengths.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-semibold" style={{ color: C.board2 }}>Điểm mạnh:</div>
                        <ul className="mt-0.5 space-y-0.5">
                          {rpt.strengths.map((s, k) => (
                            <li key={k} className="text-xs" style={{ color: C.ink }}>✓ {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {rpt.improvements.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-semibold" style={{ color: C.gold }}>Cần cải thiện:</div>
                        <ul className="mt-0.5 space-y-0.5">
                          {rpt.improvements.map((s, k) => (
                            <li key={k} className="text-xs" style={{ color: C.ink }}>→ {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-2 text-xs" style={{ color: C.muted }}>
                      Buổi {rpt.period.from} – {rpt.period.to}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Card>
      )}

    </div>
  )
}
