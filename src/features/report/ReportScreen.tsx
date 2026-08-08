import { useState, useRef, useCallback } from 'react'
import { produce } from 'immer'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getRubric } from '@/constants/rubrics'
import { round1, todayISO, viDate } from '@/utils/format'
import { statsOf } from '@/business/stats'
import { rankingOf } from '@/business/ranking'
import { periodsOf, detailBlocks, buildComment } from '@/business/report'
import { exportScores } from '@/utils/excel'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { Stat } from '@/components/atoms/Stat'
import { isMongoid } from '@/utils/mongoid'
import { reportService } from '@/services/reports'

interface ReportScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
}

export function ReportScreen({ cls, update }: ReportScreenProps) {
  const r = getRubric(cls.level)
  const periods = periodsOf(cls)
  const [pIdx, setPIdx] = useState(periods.length - 1)
  const [stIdx, setStIdx] = useState(0)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const p = periods[Math.min(pIdx, periods.length - 1)]

  const printReport = useCallback(() => {
    if (!p || !cls.students.length) return
    const rows = cls.students.map((st) => {
      const s = statsOf(cls, st.id, p.from, p.to)
      const place = rankingOf(cls, p.to).find((x) => x.student.id === st.id)?.place ?? '-'
      return { st, s, place }
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
  th { background: #12352B; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) { background: #f7faf8; }
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

  const st = cls.students[stIdx]
  if (!st) return <Card className="p-6 text-center">Lớp chưa có học sinh.</Card>

  const s = statsOf(cls, st.id, p.from, p.to)
  const place = rankingOf(cls, p.to).find((x) => x.student.id === st.id)?.place
  const key = `${st.id}:${p.from}-${p.to}`
  const saved = cls.comments?.[key]
  const comment = saved ?? buildComment(st.name, s, r)
  const blocks = detailBlocks(s, r)

  const text = [
    `BÁO CÁO HỌC TẬP — ${cls.name.toUpperCase()}`,
    `Học sinh: ${st.name.toUpperCase()} · GV: ${cls.teacher}`,
    `Giai đoạn: buổi ${p.from + 1}–${p.to}`,
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
    if (!isMongoid(cls.id) || !isMongoid(st.id)) return
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

  const chart = s.totals.map((t, i) => ({ name: `B${p.from + i + 1}`, Điểm: t }))

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={pIdx}
            onChange={(x) => setPIdx(Number(x.target.value))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {periods.map((x, i) => (
              <option key={i} value={i}>
                {x.label}
              </option>
            ))}
          </select>
          <select
            value={stIdx}
            onChange={(x) => setStIdx(Number(x.target.value))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {cls.students.map((x, i) => (
              <option key={x.id} value={i}>
                {x.name}
              </option>
            ))}
          </select>
          <Btn kind="gold" onClick={copy}>
            {copied ? '✓ Đã sao chép' : 'Sao chép gửi PH'}
          </Btn>
          <Btn kind="ghost" onClick={() => exportScores(cls, p)}>
            Xuất Excel
          </Btn>
          <Btn kind="ghost" onClick={printReport}>
            In PDF
          </Btn>
          {isMongoid(cls.id) && (
            <Btn
              kind="solid"
              onClick={syncReport}
              disabled={!isMongoid(st.id) || syncStatus === 'saving'}
              title={!isMongoid(st.id) ? 'Học sinh chưa có tài khoản' : ''}
            >
              {syncStatus === 'saving'
                ? '☁ Đang lưu...'
                : syncStatus === 'saved'
                  ? '☁ Đã lưu lên Cloud'
                  : syncStatus === 'error'
                    ? '⚠ Lỗi — thử lại'
                    : '☁ Lưu báo cáo'}
            </Btn>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
          <div className="text-xs opacity-80">
            {p.label} · {r.label}
          </div>
          <div className="text-xl font-bold">{st.name}</div>
        </div>

        <div className="p-3">
          <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>
            ĐIỂM ĐÁNH GIÁ
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {r.comps.map((c) => (
              <Stat
                key={c.key}
                label={c.label}
                value={`${round1(s.catAvg[c.key])}/${c.max}`}
                color={
                  s.catAvg[c.key] >= c.max * 0.95
                    ? C.board2
                    : s.catAvg[c.key] >= c.max * 0.7
                      ? C.ink
                      : C.red
                }
              />
            ))}
            <Stat
              label="Chuyên cần"
              value={`${round1(s.attendScore)}/10`}
              sub={
                s.late || s.excused || s.absent
                  ? `${s.late} muộn · ${s.excused} phép · ${s.absent} KP`
                  : 'đầy đủ'
              }
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
          <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>
            CHI TIẾT NHẬN XÉT
          </div>
          <div className="space-y-2">
            {blocks.map((b) => (
              <div key={b.title} className="rounded-xl p-3" style={{ background: C.paper }}>
                <div className="font-bold">
                  {b.icon} {b.title}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {b.lines.map((l, i) => (
                    <li key={i} className="text-sm" style={{ color: C.ink }}>
                      • {l}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="px-3 pb-3">
          <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>
            BIỂU ĐỒ TIẾN BỘ
          </div>
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
            <div className="text-xs font-bold" style={{ color: C.muted }}>
              NHẬN XÉT CỦA GIÁO VIÊN
            </div>
            <button
              className="text-xs font-semibold"
              style={{ color: C.blue }}
              onClick={() => setEditing(!editing)}
            >
              {editing ? 'Xong' : 'Sửa'}
            </button>
          </div>
          {editing ? (
            <textarea
              value={comment}
              onChange={(x) =>
                update(
                  produce((c) => {
                    c.comments = c.comments ?? {}
                    c.comments[key] = x.target.value
                  }),
                )
              }
              rows={5}
              className="w-full rounded-xl p-3 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />
          ) : (
            <div
              className="rounded-xl p-3 text-sm leading-relaxed"
              style={{ background: C.paper }}
            >
              {comment}
            </div>
          )}
          {saved && (
            <button
              className="mt-1 text-xs"
              style={{ color: C.muted }}
              onClick={() =>
                update(
                  produce((c) => {
                    if (c.comments) delete c.comments[key]
                  }),
                )
              }
            >
              ↺ Dùng lại nhận xét hệ thống gợi ý
            </button>
          )}
        </div>
      </Card>

      <textarea
        ref={taRef}
        value={text}
        readOnly
        className="h-64 w-full rounded-2xl p-3 text-xs"
        style={{
          border: `1px solid ${C.line}`,
          background: '#fff',
          fontFamily: 'ui-monospace, monospace',
        }}
      />
    </div>
  )
}
