import { useState, useRef, useCallback } from 'react'
import { produce } from 'immer'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getClassRubric } from '@/constants/rubrics'
import { round1, todayISO, viDate, sessionLabel } from '@/utils/format'
import { statsOf } from '@/business/stats'
import { rankingOf } from '@/business/ranking'
import { periodsOf, detailBlocks, buildComment } from '@/business/report'
import { exportScores } from '@/utils/excel'
import { sessionScore, compScore } from '@/business/scoring'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { Stat } from '@/components/atoms/Stat'
import { isMongoid } from '@/utils/mongoid'
import { reportService } from '@/services/reports'

interface ReportScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
}

type ReportTab = 'monthly' | 'sessions' | 'student'

export function ReportScreen({ cls, update }: ReportScreenProps) {
  const r = getClassRubric(cls)
  const periods = periodsOf(cls)
  const [tab, setTab] = useState<ReportTab>('monthly')
  const [pIdx, setPIdx] = useState(periods.length - 1)
  const [stIdx, setStIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const p = periods[Math.min(pIdx, periods.length - 1)]
  const st = cls.students[stIdx]

  // ── Per-student full export ──────────────────────────────────────────────
  const printStudentFull = useCallback((studentIdx: number) => {
    const student = cls.students[studentIdx]
    if (!student) return
    const s = statsOf(cls, student.id, 0, null)

    const sessionRows = cls.sessions.map((sess, i) => {
      const e = sess.entries[student.id]
      const t = sessionScore(e, r)
      const attended = e?.attendance && e.attendance !== 'absent'
      return { no: sess.no, date: sess.date, attended, total: t, entry: e, sessIdx: i }
    })

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Báo cáo ${student.name} — ${cls.name}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .sub { color: #555; margin-bottom: 12px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #1B3A6B; color: #fff; padding: 5px 8px; text-align: left; font-size: 11px; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) { background: #f7f9fc; }
  .num { text-align: right; }
  .bold { font-weight: bold; }
  .absent { color: #999; }
  .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 12px; }
  .stat { background: #f4f7fc; border-radius: 6px; padding: 8px 10px; }
  .stat-val { font-weight: bold; font-size: 15px; color: #1B3A6B; }
  .stat-lbl { font-size: 10px; color: #666; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>BÁO CÁO HỌC TẬP CÁ NHÂN — ${student.name.toUpperCase()}</h1>
<div class="sub">Lớp: ${cls.name} · GV: ${cls.teacher || 'chưa điền'} · Tổng ${cls.sessions.length} buổi</div>

<div class="stat-grid">
  <div class="stat"><div class="stat-val">${round1(s.avg)}/100</div><div class="stat-lbl">Điểm trung bình</div></div>
  <div class="stat"><div class="stat-val">${s.attended}/${s.attended + s.absent}</div><div class="stat-lbl">Có mặt / Tổng</div></div>
  <div class="stat"><div class="stat-val">${s.streak}</div><div class="stat-lbl">Streak dài nhất</div></div>
  ${r.comps.map((c) => `<div class="stat"><div class="stat-val">${round1(s.catAvg[c.key])}/${c.max}</div><div class="stat-lbl">${c.label}</div></div>`).join('')}
</div>

<h2>CHI TIẾT TỪNG BUỔI</h2>
<table>
<thead><tr>
<th>Buổi</th><th>Ngày</th><th>Chuyên cần</th>
${r.comps.map((c) => `<th>${c.label}</th>`).join('')}
<th>Tổng</th>
${cls.sessions[0]?.homework !== undefined ? '<th>BTVN</th>' : ''}
</tr></thead>
<tbody>
${sessionRows.map(({ no, date, attended, total, entry, sessIdx: _ }) => {
  const attendLabel = entry?.attendance === 'present' ? 'P' : entry?.attendance === 'late' ? 'Muộn' : entry?.attendance === 'excused' ? 'Phép' : entry?.attendance === 'absent' ? 'Vắng' : '—'
  return `<tr class="${!attended ? 'absent' : ''}">
<td>${sessionLabel(no, cls.perMonth)}</td>
<td>${viDate(date)}</td>
<td class="num">${attendLabel}</td>
${r.comps.map(() => {
  if (!entry || !attended) return '<td class="num">—</td>'
  return '<td class="num">—</td>'
}).join('')}
<td class="num bold">${total !== null && total !== undefined ? total : '—'}</td>
</tr>`
}).join('')}
</tbody>
</table>

<h2>NHẬN XÉT</h2>
<p style="line-height:1.6">${buildComment(student.name, s, r)}</p>

<p style="margin-top:16px;font-size:10px;color:#888">In lúc ${new Date().toLocaleString('vi-VN')}</p>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }, [cls, r])

  // ── Monthly PDF ──────────────────────────────────────────────────────────
  const printReport = useCallback(() => {
    if (!p || !cls.students.length) return
    const rows = cls.students.map((student) => {
      const s = statsOf(cls, student.id, p.from, p.to)
      const place = rankingOf(cls, p.to).find((x) => x.student.id === student.id)?.place ?? '-'
      return { st: student, s, place }
    }).sort((a, b) => b.s.monthTotal - a.s.monthTotal)

    const sessionDates = cls.sessions.slice(p.from, p.to).map((s) => viDate(s.date)).join(', ')

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Báo cáo — ${cls.name} — ${p.label}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 16px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1B3A6B; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f7f9fc; }
  .num { text-align: right; }
  .bold { font-weight: bold; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>BÁO CÁO HỌC TẬP — ${cls.name.toUpperCase()}</h1>
<div class="sub">Kỳ: ${p.label} · GV: ${cls.teacher || 'chưa điền'} · Buổi ${p.from + 1}–${p.to} (${sessionDates})</div>
<table>
<thead><tr>
<th>STT</th><th>Học sinh</th>
${r.comps.map((c) => `<th>${c.label}</th>`).join('')}
<th>Chuyên cần</th><th>Tổng</th><th>Xếp hạng</th>
</tr></thead>
<tbody>
${rows.map((row, i) => `<tr>
<td>${i + 1}</td>
<td class="bold">${row.st.name}</td>
${r.comps.map((c) => `<td class="num">${round1(row.s.catAvg[c.key])}</td>`).join('')}
<td class="num">${round1(row.s.attendScore)}</td>
<td class="num bold">${round1(row.s.monthTotal)}</td>
<td class="num">Top ${row.place}</td>
</tr>`).join('')}
</tbody>
</table>
<p style="margin-top:12px;font-size:10px;color:#888">In lúc ${new Date().toLocaleString('vi-VN')}</p>
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }, [cls, p, r])

  if (!st) return <Card className="p-6 text-center">Lớp chưa có học sinh.</Card>

  const s = statsOf(cls, st.id, p?.from ?? 0, p?.to ?? cls.sessions.length)
  const place = rankingOf(cls, p?.to ?? cls.sessions.length).find((x) => x.student.id === st.id)?.place
  const key = `${st.id}:${p?.from ?? 0}-${p?.to ?? cls.sessions.length}`
  const saved = cls.comments?.[key]
  const comment = saved ?? buildComment(st.name, s, r)
  const blocks = detailBlocks(s, r)

  const text = [
    `BÁO CÁO HỌC TẬP — ${cls.name.toUpperCase()}`,
    `Học sinh: ${st.name.toUpperCase()} · GV: ${cls.teacher}`,
    p ? `Giai đoạn: buổi ${p.from + 1}–${p.to}` : `Toàn bộ ${cls.sessions.length} buổi`,
    '',
    'ĐIỂM ĐÁNH GIÁ',
    ...r.comps.map((c) => `• ${c.label}: ${round1(s.catAvg[c.key])}/${c.max}`),
    `• Chuyên cần: ${round1(s.attendScore)}/10`,
    `TỔNG ĐIỂM: ${round1(s.monthTotal)}/100 · Xếp hạng: Top ${place}/${cls.students.length}`,
    '',
    'CHI TIẾT NHẬN XÉT',
    ...blocks.flatMap((b) => [`${b.icon} ${b.title}`, ...b.lines.map((l) => `  - ${l}`), '']),
    'Nhận xét của giáo viên:',
    comment,
  ].join('\n')

  async function syncReport() {
    if (!p || !isMongoid(cls.id) || !isMongoid(st.id)) return
    setSyncStatus('saving')
    const fromSession = cls.sessions[p.from]
    const toSession = cls.sessions[Math.min(p.to, cls.sessions.length) - 1] ?? fromSession
    const strengths = r.comps
      .filter((c) => s.catAvg[c.key] >= c.max * 0.9)
      .map((c) => `${c.label}: ${round1(s.catAvg[c.key])}/${c.max}`)
    const improvements = r.comps
      .filter((c) => s.catAvg[c.key] < c.max * 0.7)
      .map((c) => `${c.label}: ${round1(s.catAvg[c.key])}/${c.max}`)
    try {
      await reportService.upsert({
        classId: cls.id,
        studentId: st.id,
        period: {
          from: fromSession?.date ?? todayISO(),
          to: toSession?.date ?? todayISO(),
          label: p.label,
        },
        title: `${p.label} — ${st.name}`,
        summary: text,
        comment,
        strengths,
        improvements,
        score: Math.round(s.monthTotal),
      })
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2500)
    } catch {
      setSyncStatus('error')
    }
  }

  function copy() {
    if (taRef.current) {
      taRef.current.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      } catch {}
    }
  }

  const chart = s.totals.map((t, i) => ({ name: `B${(p?.from ?? 0) + i + 1}`, Điểm: t }))

  const TABS: { key: ReportTab; label: string }[] = [
    { key: 'monthly', label: 'Full tháng' },
    { key: 'sessions', label: 'Từng buổi' },
    { key: 'student', label: 'Học sinh' },
  ]

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <Card className="p-3">
        <div className="flex gap-1 mb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="rounded-xl px-4 py-1.5 text-sm font-semibold"
              style={{
                background: tab === t.key ? C.board : C.paper,
                color: tab === t.key ? '#fff' : C.muted,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {tab !== 'sessions' && (
            <select
              value={pIdx}
              onChange={(x) => setPIdx(Number(x.target.value))}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ border: `1px solid ${C.line}` }}
            >
              {periods.map((x, i) => (
                <option key={i} value={i}>{x.label}</option>
              ))}
            </select>
          )}
          <select
            value={stIdx}
            onChange={(x) => setStIdx(Number(x.target.value))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {cls.students.map((x, i) => (
              <option key={x.id} value={i}>{x.name}</option>
            ))}
          </select>

          {tab === 'monthly' && (
            <>
              <Btn kind="gold" onClick={copy}>{copied ? '✓ Đã sao chép' : 'Sao chép gửi PH'}</Btn>
              <Btn kind="ghost" onClick={() => exportScores(cls, p)}>Xuất Excel</Btn>
              <Btn kind="ghost" onClick={printReport}>In PDF cả lớp</Btn>
              {isMongoid(cls.id) && (
                <Btn kind="solid" onClick={syncReport} disabled={!isMongoid(st.id) || syncStatus === 'saving'}>
                  {syncStatus === 'saving' ? '☁ Đang lưu...' : syncStatus === 'saved' ? '☁ Đã lưu' : syncStatus === 'error' ? '⚠ Lỗi' : '☁ Lưu báo cáo'}
                </Btn>
              )}
            </>
          )}

          {tab === 'student' && (
            <Btn kind="gold" onClick={() => printStudentFull(stIdx)}>
              Xuất PDF toàn bộ buổi học
            </Btn>
          )}
        </div>
      </Card>

      {/* ── Tab: Từng buổi ── */}
      {tab === 'sessions' && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">Chi tiết từng buổi · {st.name}</div>
            <div className="text-lg font-bold">{cls.name}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.paper }}>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Buổi</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
                  <th className="py-2 px-3 text-center font-semibold" style={{ color: C.muted }}>Chuyên cần</th>
                  {r.comps.map((c) => (
                    <th key={c.key} className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>
                      {c.label}
                    </th>
                  ))}
                  <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Tổng</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {cls.sessions.map((sess) => {
                  const e = sess.entries[st.id]
                  const t = sessionScore(e, r)
                  const attendLabel: Record<string, string> = {
                    present: 'P', late: 'Muộn', excused: 'Phép', absent: 'Vắng',
                  }
                  const absent = !e || e.attendance === 'absent'
                  return (
                    <tr key={sess.id} style={{ borderTop: `1px solid ${C.line}`, opacity: absent ? 0.5 : 1 }}>
                      <td className="py-2 px-3 font-bold">{sessionLabel(sess.no, cls.perMonth)}</td>
                      <td className="py-2 px-3">{viDate(sess.date)}</td>
                      <td className="py-2 px-3 text-center">
                        {e ? attendLabel[e.attendance] ?? '—' : '—'}
                      </td>
                      {r.comps.map((c) => (
                        <td key={c.key} className="py-2 px-3 text-right">
                          {e && !absent ? compScore(c, e) : '—'}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-bold">
                        {t !== null ? t : '—'}
                      </td>
                      <td className="py-2 px-3 text-xs" style={{ color: C.muted }}>
                        {e?.note || ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Tab: Full tháng ── */}
      {tab === 'monthly' && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">{p?.label} · {r.label}</div>
            <div className="text-xl font-bold">{st.name}</div>
          </div>

          <div className="p-3">
            <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>ĐIỂM ĐÁNH GIÁ</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {r.comps.map((c) => (
                <Stat
                  key={c.key}
                  label={c.label}
                  value={`${round1(s.catAvg[c.key])}/${c.max}`}
                  color={s.catAvg[c.key] >= c.max * 0.95 ? C.board2 : s.catAvg[c.key] >= c.max * 0.7 ? C.ink : C.red}
                />
              ))}
              <Stat
                label="Chuyên cần"
                value={`${round1(s.attendScore)}/10`}
                sub={s.late || s.excused || s.absent ? `${s.late} muộn · ${s.excused} phép · ${s.absent} KP` : 'đầy đủ'}
              />
              <Stat
                label="TỔNG ĐIỂM"
                value={`${round1(s.monthTotal)}/100`}
                color={C.board2}
                sub={`Top ${place}/${cls.students.length} · Lv.${s.level}`}
              />
            </div>
          </div>

          <div className="px-3 pb-3">
            <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>CHI TIẾT NHẬN XÉT</div>
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.title} className="rounded-xl p-3" style={{ background: C.paper }}>
                  <div className="font-bold">{b.icon} {b.title}</div>
                  <ul className="mt-1 space-y-0.5">
                    {b.lines.map((l, i) => (
                      <li key={i} className="text-sm" style={{ color: C.ink }}>• {l}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 pb-3">
            <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>BIỂU ĐỒ TIẾN BỘ</div>
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
          </div>

          <div className="px-3 pb-4">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-xs font-bold" style={{ color: C.muted }}>NHẬN XÉT CỦA GIÁO VIÊN</div>
              <button className="text-xs font-semibold" style={{ color: C.blue }} onClick={() => setEditing(!editing)}>
                {editing ? 'Xong' : 'Sửa'}
              </button>
            </div>
            {editing ? (
              <textarea
                value={comment}
                onChange={(x) =>
                  update(produce((c) => {
                    c.comments = c.comments ?? {}
                    c.comments[key] = x.target.value
                  }))
                }
                rows={5}
                className="w-full rounded-xl p-3 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
            ) : (
              <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: C.paper }}>
                {comment}
              </div>
            )}
            {saved && (
              <button
                className="mt-1 text-xs"
                style={{ color: C.muted }}
                onClick={() =>
                  update(produce((c) => { if (c.comments) delete c.comments[key] }))
                }
              >
                ↺ Dùng lại nhận xét hệ thống gợi ý
              </button>
            )}
          </div>
        </Card>
      )}

      {/* ── Tab: Học sinh ── */}
      {tab === 'student' && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">Tổng kết toàn bộ · {cls.name}</div>
            <div className="text-xl font-bold">{st.name}</div>
          </div>
          <div className="p-4 space-y-3">
            {(() => {
              const full = statsOf(cls, st.id, 0, null)
              return (
                <>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {r.comps.map((c) => (
                      <Stat key={c.key} label={c.label} value={`${round1(full.catAvg[c.key])}/${c.max}`}
                        color={full.catAvg[c.key] >= c.max * 0.95 ? C.board2 : full.catAvg[c.key] >= c.max * 0.7 ? C.ink : C.red}
                      />
                    ))}
                    <Stat label="Điểm trung bình" value={`${round1(full.avg)}/100`} color={C.board2} />
                    <Stat label="Có mặt" value={`${full.attended}/${full.attended + full.absent}`} />
                    <Stat label="Streak" value={`${full.streak} buổi`} sub="liên tiếp dài nhất" />
                    <Stat label="Giờ tự học" value={`${cls.sessions.reduce((a, ss) => a + (ss.entries[st.id]?.homeHours ?? 0), 0)}h`} sub="tổng ở nhà" />
                    <Stat label="Giờ ở lại" value={`${cls.sessions.reduce((a, ss) => a + (ss.entries[st.id]?.stayHours ?? 0), 0)}h`} sub="học thêm" />
                  </div>
                  <div className="text-xs font-bold uppercase mt-2" style={{ color: C.muted }}>Nhận xét tổng kết</div>
                  <div className="rounded-xl p-3 text-sm leading-relaxed" style={{ background: C.paper }}>
                    {buildComment(st.name, full, r)}
                  </div>
                </>
              )
            })()}
          </div>
        </Card>
      )}

      {tab === 'monthly' && (
        <textarea
          ref={taRef}
          value={text}
          readOnly
          className="h-64 w-full rounded-2xl p-3 text-xs"
          style={{ border: `1px solid ${C.line}`, background: '#fff', fontFamily: 'ui-monospace, monospace' }}
        />
      )}
    </div>
  )
}
