import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { overviewService } from '@/services/overview'
import { todayISO } from '@/utils/format'
import { attendanceOverview, rangeDays, weekdayLabel, dm, type OverviewCell, type RangeKey } from '@/business/attendanceOverview'
import { exportAttendanceOverview } from '@/utils/excel'

const RANGE_KEY = 'lms:attendanceRange'
const readRange = (): RangeKey => { try { const v = localStorage.getItem(RANGE_KEY); return v === 'week' || v === 'month' ? v : '14' } catch { return '14' } }

const CELL_STYLE: Record<OverviewCell['kind'], { bg: string; border: string; color: string; dashed?: boolean }> = {
  full: { bg: C.emerald + '14', border: C.emerald + '55', color: C.emerald },
  partial: { bg: C.amber + '14', border: C.amber, color: C.amber },
  lonely: { bg: C.rose + '12', border: C.rose, color: C.rose },
  missing: { bg: 'transparent', border: C.rose, color: C.rose, dashed: true },
}
const scoreColor = (n: number) => (n >= 80 ? C.emerald : n >= 65 ? C.amber : C.rose)

function Cell({ cell, compact }: { cell: OverviewCell | undefined; compact?: boolean }) {
  if (!cell) return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: C.line }} />
  const st = CELL_STYLE[cell.kind]
  const title = cell.kind === 'missing' ? 'Có lịch mà chưa có buổi nào' : `${cell.count}/${cell.roster} em có buổi${cell.avg != null ? ` · điểm TB ${cell.avg}` : ''}${cell.kind === 'lonely' ? ` (${cell.studentNames.join(', ')})` : ''}`
  return (
    <span title={title} data-cell={cell.kind} className={`inline-flex ${compact ? 'h-9 w-9' : 'h-10 w-11'} flex-col items-center justify-center rounded-lg text-[12px] font-bold leading-tight`}
      style={{ background: st.bg, border: `1.5px ${st.dashed ? 'dashed' : 'solid'} ${st.border}`, color: st.color }}>
      {cell.kind === 'missing' ? '!' : <>{compact ? cell.count : `${cell.count}/${cell.roster}`}{cell.avg != null && <span className="text-[10px]" style={{ color: scoreColor(cell.avg) }}>{cell.avg}</span>}{cell.avg == null && !compact && <span className="text-[10px]" style={{ color: C.muted }}>–</span>}</>}
    </span>
  )
}

/** Màn "Điểm danh & Điểm — Toàn trung tâm" (đợt 2, CHỈ XEM): mỗi lớp 1 dòng × các ngày, khung
 *  "Cần xử lý". Bấm 1 lớp / 1 việc → mở lớp đó (`onOpenClass`). Số liệu tính bằng hàm thuần
 *  `attendanceOverview` (có test) trên đúng dữ liệu màn Học phí toàn trung tâm. */
export function AttendanceCenterView({ isAdmin, onOpenClass }: { isAdmin: boolean; onOpenClass: (classId: string) => void }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['center-overview'], queryFn: overviewService.center, staleTime: 0, refetchOnMount: 'always' })
  const [range, setRangeState] = useState<RangeKey>(readRange)
  const setRange = (r: RangeKey) => { setRangeState(r); try { localStorage.setItem(RANGE_KEY, r) } catch { /* tiện ích nhớ lựa chọn */ } }
  const [showAllTodos, setShowAllTodos] = useState(false)
  const today = todayISO()
  const days = useMemo(() => rangeDays(range, today), [range, today])
  const phoneDays = useMemo(() => rangeDays('14', today).slice(-7), [today])
  const ov = useMemo(() => (data ? attendanceOverview(data, days, today) : null), [data, days, today])
  const ovPhone = useMemo(() => (data ? attendanceOverview(data, phoneDays, today) : null), [data, phoneDays, today])

  if (isLoading) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Đang tải điểm danh toàn trung tâm...</div>
  if (error || !ov || !ovPhone) {
    return (
      <div className="rounded-2xl p-6 text-center text-sm" style={{ background: C.card, color: C.rose }}>
        Không tải được dữ liệu điểm danh — kiểm tra mạng. Vẫn nhập điểm được ở thẻ "Theo lớp".
        <div className="mt-3"><Btn size="sm" onClick={() => void refetch()}>Thử lại</Btn></div>
      </div>
    )
  }
  const todos = showAllTodos ? ov.todos : ov.todos.slice(0, 8)
  const todayFull = ov.todayClasses.filter((c) => c.count >= c.roster && c.roster > 0).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl p-[3px]" style={{ background: C.line }} role="tablist" aria-label="Khoảng ngày">
          {([['week', 'Tuần này'], ['14', '14 ngày'], ['month', `Tháng ${Number(today.slice(5, 7))}`]] as Array<[RangeKey, string]>).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={range === k} onClick={() => setRange(k)} className="rounded-[9px] px-3 py-1.5 text-[13px] font-semibold"
              style={range === k ? { background: C.card, color: C.board, boxShadow: '0 1px 3px rgba(15,23,42,.12)' } : { color: C.muted }}>{label}</button>
          ))}
        </div>
        <div className="ml-auto"><Btn size="sm" onClick={() => exportAttendanceOverview(ov.rows, days)}>Xuất Excel</Btn></div>
      </div>

      <div className="rounded-2xl px-4 py-3 text-sm shadow-sm" style={{ background: C.card, color: C.ink }} data-testid="today-line">
        <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: C.board2 }} />
        Hôm nay <b>{weekdayLabel(today)} {dm(today)}</b>: {ov.todayClasses.length ? <>{ov.todayClasses.length} lớp có lịch ({ov.todayClasses.map((c) => `${c.className} ${c.count}/${c.roster}`).join(' · ')}), <b>{todayFull}</b> lớp đã điểm danh đủ</> : 'không lớp nào có lịch'}
        <span className="mx-2" style={{ color: C.line }}>|</span><b>{ov.todos.length}</b> việc cần xử lý
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* Máy tính: bảng lớp × ngày */}
        <div className="hidden overflow-x-auto rounded-2xl shadow-sm md:block" style={{ background: C.card }}>
          <div className="px-4 pt-3 text-sm" style={{ color: C.muted }}><b style={{ color: C.ink }}>{ov.rows.length} lớp · {days.length} ngày</b> &nbsp;{dm(days[0])} – {dm(days[days.length - 1])} · bấm 1 dòng để mở lớp</div>
          <table className="mt-1 w-full text-sm">
            <thead>
              <tr style={{ color: C.muted }} className="text-[11px]">
                <th className="px-4 py-2 text-left font-semibold">Lớp</th>
                {days.map((d) => <th key={d} className="px-0.5 py-2 text-center font-semibold" style={d === today ? { color: C.board2 } : undefined}>{weekdayLabel(d)}<br />{d.slice(8, 10)}</th>)}
                <th className="px-2 py-2 text-center font-semibold">Đi học</th>
                <th className="px-2 py-2 text-center font-semibold">Điểm TB</th>
                <th className="px-2 py-2 text-center font-semibold">Vắng KP</th>
              </tr>
            </thead>
            <tbody>
              {ov.rows.map((r) => (
                <tr key={r.classId} data-class-row={r.className} onClick={() => onOpenClass(r.classId)} className="cursor-pointer hover:brightness-[0.98]" style={{ borderTop: `1px solid ${C.paper}`, background: C.card }}>
                  <td className="px-4 py-2"><b className="block" style={{ color: C.ink }}>{r.className}</b><span className="text-xs" style={{ color: C.muted }}>{r.roster} em{r.teacherName ? ` · ${r.teacherName}` : ''}</span></td>
                  {days.map((d) => <td key={d} className="px-0.5 py-1 text-center"><Cell cell={r.cells[d]} /></td>)}
                  <td className="px-2 text-center font-bold" style={{ color: C.ink }}>{r.attendRate == null ? '—' : `${r.attendRate}%`}</td>
                  <td className="px-2 text-center font-bold" style={{ color: r.avgScore == null ? C.muted : scoreColor(r.avgScore) }}>{r.avgScore ?? '—'}</td>
                  <td className="px-2 text-center font-bold" style={{ color: r.unexcused ? C.rose : C.muted }}>{r.unexcused}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Legend />
        </div>

        {/* Cần xử lý */}
        <div className="h-fit overflow-hidden rounded-2xl shadow-sm lg:order-none" style={{ background: C.card }} data-testid="todo-box">
          <div className="flex items-center justify-between px-4 py-3">
            <b style={{ color: C.ink }}>Cần xử lý</b>
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: C.rose + '18', color: C.rose }}>{ov.todos.length}</span>
          </div>
          {ov.todos.length === 0 && <div className="px-4 pb-4 text-sm" style={{ color: C.muted }}>Không có ngày nào cần xem lại {isAdmin ? 'ở toàn trung tâm' : 'ở các lớp của bạn'}.</div>}
          {todos.map((t) => (
            <div key={`${t.classId}-${t.kind}-${t.dates.join()}`} data-todo={t.className} className="px-4 py-2.5 text-sm" style={{ borderTop: `1px solid ${C.paper}` }}>
              <div className="font-bold" style={{ color: C.ink }}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: C.rose }} />{t.className}</div>
              <div className="mt-0.5" style={{ color: C.muted }}>{t.text}</div>
              <button type="button" onClick={() => onOpenClass(t.classId)} className="mt-1 text-[13px] font-bold" style={{ color: C.board2 }}>{t.kind === 'missing' ? 'Điểm danh →' : 'Xem lại →'}</button>
            </div>
          ))}
          {ov.todos.length > 8 && !showAllTodos && (
            <button type="button" onClick={() => setShowAllTodos(true)} className="w-full px-4 py-3 text-left text-[13px] font-bold" style={{ color: C.board2, borderTop: `1px solid ${C.paper}` }}>Xem cả {ov.todos.length} mục →</button>
          )}
        </div>

        {/* Điện thoại: 7 ngày qua, mỗi lớp 1 dòng */}
        <div className="overflow-hidden rounded-2xl shadow-sm md:hidden" style={{ background: C.card }} data-testid="phone-grid">
          <div className="px-4 pt-3 text-sm"><b style={{ color: C.ink }}>7 ngày qua</b> <span style={{ color: C.muted }}>{dm(phoneDays[0])}–{dm(phoneDays[6])}</span></div>
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(7,36px)] gap-x-1 px-3 pt-2 text-center text-[10px] font-semibold" style={{ color: C.muted }}>
            <span />{phoneDays.map((d) => <span key={d} style={d === today ? { color: C.board2 } : undefined}>{weekdayLabel(d)}<br />{d.slice(8, 10)}</span>)}
          </div>
          {ovPhone.rows.map((r) => (
            <div key={r.classId} data-class-row={r.className} onClick={() => onOpenClass(r.classId)} className="grid grid-cols-[minmax(0,1fr)_repeat(7,36px)] items-center gap-x-1 px-3 py-1.5" style={{ borderTop: `1px solid ${C.paper}` }}>
              <span className="min-w-0"><b className="block truncate text-sm" style={{ color: C.ink }}>{r.className}</b><span className="text-[11px]" style={{ color: C.muted }}>{r.roster} em</span></span>
              {phoneDays.map((d) => <span key={d} className="flex justify-center"><Cell cell={r.cells[d]} compact /></span>)}
            </div>
          ))}
          <div className="px-4 py-2 text-[11px]" style={{ color: C.muted }}>Số trong ô = số em có buổi hôm đó · số nhỏ = điểm TB. Bấm 1 lớp để mở lớp.</div>
        </div>
      </div>
    </div>
  )
}

function Legend() {
  const item = (kind: OverviewCell['kind'], text: string) => {
    const st = CELL_STYLE[kind]
    return <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded" style={{ background: st.bg, border: `1.5px ${st.dashed ? 'dashed' : 'solid'} ${st.border}` }} />{text}</span>
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs" style={{ color: C.muted, borderTop: `1px solid ${C.paper}` }}>
      {item('full', 'Đủ cả lớp')}{item('partial', 'Còn em chưa điểm danh')}{item('lonely', 'Chỉ 1–2 em có buổi')}{item('missing', 'Có lịch mà chưa có buổi nào')}
      <span>Số trên: em có buổi / sĩ số · số dưới: điểm TB buổi đó</span>
    </div>
  )
}
