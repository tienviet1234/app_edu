import { useMemo, useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { getClassRubric } from '@/constants/rubrics'
import { sessionScore, sessionComps } from '@/business/scoring'
import { classGrid, type GridCell } from '@/business/classGrid'
import { sessionLabelOf } from '@/business/tuition'
import { weekdayLabel, dm } from '@/business/attendanceOverview'
import { todayISO } from '@/utils/format'
import { useAttendanceWriter } from './useAttendanceWriter'

const ATT_BADGE: Record<AttendanceKey, { mark: string; label: string; color: string }> = {
  present: { mark: '✓', label: 'Có mặt', color: C.emerald },
  late: { mark: 'M', label: 'Đi muộn', color: C.amber },
  excused: { mark: 'P', label: 'Nghỉ có phép', color: C.blue },
  absent: { mark: 'V', label: 'Nghỉ không phép', color: C.rose },
}
const scoreColor = (n: number) => (n >= 80 ? C.emerald : n >= 65 ? C.amber : C.rose)

function Badge({ a }: { a: AttendanceKey }) {
  const b = ATT_BADGE[a]
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-black text-white" style={{ background: b.color }}>{b.mark}</span>
}

/** Lưới cả lớp (đợt 2 C2, CHỈ XEM): học sinh × 7 buổi gần nhất; bấm 1 ô xem chi tiết, "Chấm điểm chi
 *  tiết →" mở đúng em + đúng buổi ở "Chấm từng em". Số liệu: `classGrid` (có test) trên dữ liệu máy. */
export function ClassGridView({ cls, update, teacherName, onOpenEntry }: { cls: ClassData; update: (fn: (c: ClassData) => void) => void; teacherName?: string; onOpenEntry: (studentId: string, no: number) => void }) {
  const today = todayISO()
  const r = getClassRubric(cls)
  const grid = useMemo(() => classGrid(cls.students, today, (s) => sessionScore(s.entry, { ...r, comps: sessionComps(r, s) })), [cls, today, r])
  const [sel, setSel] = useState<{ studentId: string; date: string } | null>(null)
  const selRow = sel ? grid.rows.find((x) => x.studentId === sel.studentId) : null
  const selCell: GridCell | undefined = sel && selRow ? selRow.cells[sel.date] : undefined
  const offsetOf = (id: string) => cls.students.find((s) => s.id === id)?.sessionOffset
  // Đợt 3: đổi điểm danh ngay trong khung chi tiết — cùng đường ghi với Điểm danh nhanh.
  const w = useAttendanceWriter(cls, update, teacherName)
  async function setAtt(studentId: string, date: string, k: AttendanceKey, exists: boolean) {
    const name = cls.students.find((s) => s.id === studentId)?.name ?? ''
    if (!exists && !confirm(`${name} chưa có buổi ngày ${dm(date)}. Ghi "${ATT_BADGE[k].label}" sẽ TẠO buổi mới ngày này (tính học phí). Ghi?`)) return
    await w.mark(studentId, date, k)
  }

  if (!cls.students.length) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp chưa có học sinh nào.</div>
  if (!grid.days.length) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp chưa có buổi học nào — điểm danh ở thẻ "Chấm từng em".</div>

  const panel = sel && selRow && (
    <div data-testid="grid-panel" className="space-y-3 p-4">
      <div>
        <div className="text-lg font-extrabold" style={{ color: C.ink }}>{selRow.name}</div>
        <div className="text-sm" style={{ color: C.muted }}>{weekdayLabel(sel.date)} {dm(sel.date)}{selCell ? ` · ${sessionLabelOf(selCell.no, cls.perMonth, offsetOf(sel.studentId))}` : ''}</div>
      </div>
      {selCell ? (
        <>
          <AttButtons on={selCell.attendance} busy={w.isBusy(sel.studentId, sel.date)} status={w.status(sel.studentId, sel.date)} onPick={(k) => void setAtt(sel.studentId, sel.date, k, true)} />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span style={{ color: C.muted }}>Tổng điểm</span><b data-testid="panel-total" style={{ color: selCell.total == null ? C.muted : scoreColor(selCell.total) }}>{selCell.total ?? 'Chưa chấm'}</b></div>
            <div className="flex justify-between gap-3"><span style={{ color: C.muted }}>Bài tập về nhà</span><span className="text-right" style={{ color: C.ink }}>{selCell.homework || '—'}</span></div>
          </div>
          <Btn kind="solid" className="w-full" onClick={() => onOpenEntry(sel.studentId, selCell.no)}>Chấm điểm chi tiết →</Btn>
          <div className="text-xs" style={{ color: C.muted }}>Mở đúng phiếu chấm của {selRow.name}, buổi {dm(sel.date)}. Đổi điểm danh ngay ở trên — lưu lên server liền.</div>
        </>
      ) : (
        <>
          <div className="rounded-xl p-3 text-sm" style={{ background: C.rose + '10', color: C.rose }}>{selRow.name} chưa có buổi ngày {dm(sel.date)}.</div>
          {sel.date <= today && <AttButtons on={null} busy={w.isBusy(sel.studentId, sel.date)} status={w.status(sel.studentId, sel.date)} onPick={(k) => void setAtt(sel.studentId, sel.date, k, false)} />}
          <Btn className="w-full" onClick={() => { const nos = cls.students.find((s) => s.id === sel.studentId)?.sessions.map((s) => s.no) ?? []; onOpenEntry(sel.studentId, nos.length ? Math.max(...nos) : 1) }}>Mở "Chấm từng em" của {selRow.name}</Btn>
        </>
      )}
    </div>
  )

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl shadow-sm" style={{ background: C.card }}>
        <div className="px-4 pt-3 text-sm" style={{ color: C.muted }}><b style={{ color: C.ink }}>{grid.days.length} buổi gần nhất</b> · bấm 1 ô để xem · ô viền đỏ = em chưa có buổi ngày đó</div>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full text-sm" data-testid="class-grid">
            <thead>
              <tr className="text-[11px]" style={{ color: C.muted }}>
                <th className="sticky left-0 z-10 px-3 py-2 text-left font-semibold" style={{ background: C.card }}>Học sinh</th>
                {grid.days.map((d) => (
                  <th key={d} className="px-1 py-2 text-center font-semibold">{weekdayLabel(d)}<br /><span style={{ color: C.ink }}>{dm(d)}</span><br />
                    <span className="rounded-full px-1.5" style={{ background: grid.dayCounts[d] >= cls.students.length ? C.emerald + '18' : C.amber + '18', color: grid.dayCounts[d] >= cls.students.length ? C.emerald : C.amber }}>{grid.dayCounts[d]}/{cls.students.length}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold">Đi học</th>
                <th className="px-2 py-2 text-center font-semibold">Điểm TB</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.studentId} data-student={row.name} style={{ borderTop: `1px solid ${C.paper}` }}>
                  <td className="sticky left-0 z-10 whitespace-nowrap px-3 py-1.5 font-semibold" style={{ background: C.card, color: C.ink }}>{row.name}</td>
                  {grid.days.map((d) => {
                    const c = row.cells[d]
                    const on = sel?.studentId === row.studentId && sel.date === d
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <button type="button" data-cell-date={d} onClick={() => setSel({ studentId: row.studentId, date: d })}
                          className="inline-flex h-10 w-[72px] items-center justify-center gap-1.5 rounded-xl text-sm font-bold"
                          style={{ border: on ? `2px solid ${C.board}` : c ? `1px solid ${C.line}` : `1.5px dashed ${C.rose}`, background: C.card }}>
                          {c ? <><Badge a={c.attendance} /><span style={{ color: c.total == null ? C.muted : scoreColor(c.total) }}>{c.total ?? '–'}</span></> : <span style={{ color: C.rose }}>·</span>}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 text-center font-bold" style={{ color: C.ink }}>{row.attended}/{grid.days.length}</td>
                  <td className="px-2 text-center font-bold" style={{ color: row.avg == null ? C.muted : scoreColor(row.avg) }}>{row.avg ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs" style={{ color: C.muted, borderTop: `1px solid ${C.paper}` }}>
          {(Object.keys(ATT_BADGE) as AttendanceKey[]).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><Badge a={k} />{ATT_BADGE[k].label}</span>)}
          <span>Số bên cạnh = điểm buổi đó · – = mới điểm danh, chưa chấm</span>
        </div>
      </div>
      {/* Máy tính: khung bên phải · điện thoại: khung trượt từ dưới lên */}
      <div className="hidden h-fit rounded-2xl shadow-sm lg:block" style={{ background: C.card }}>
        {panel || <div className="p-4 text-sm" style={{ color: C.muted }}>Bấm 1 ô trong lưới để xem điểm danh, điểm và mở phiếu chấm của em đó.</div>}
      </div>
      {panel && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl shadow-2xl lg:hidden" style={{ background: C.card }} role="dialog">
          <div className="flex justify-between px-4 pt-3"><span className="mx-auto h-1.5 w-10 rounded-full" style={{ background: C.line }} /><button type="button" aria-label="Đóng" onClick={() => setSel(null)} className="text-sm" style={{ color: C.muted }}>✕</button></div>
          {panel}
        </div>
      )}
    </div>
  )
}

function AttButtons({ on, busy, status, onPick }: { on: AttendanceKey | null; busy: boolean; status?: string; onPick: (k: AttendanceKey) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted }}>Điểm danh{busy || status === 'saving' ? ' · đang lưu...' : status === 'saved' ? ' · đã lưu' : status === 'error' ? ' · CHƯA lưu' : status === 'offline' ? ' · chờ mạng' : ''}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(ATT_BADGE) as AttendanceKey[]).map((k) => (
          <button key={k} type="button" disabled={busy} aria-pressed={on === k} data-att={k} onClick={() => onPick(k)}
            className="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ border: `1.5px solid ${on === k ? ATT_BADGE[k].color : C.line}`, background: on === k ? ATT_BADGE[k].color + '14' : C.card, color: C.ink }}>
            <Badge a={k} />{ATT_BADGE[k].label}
          </button>
        ))}
      </div>
    </div>
  )
}
