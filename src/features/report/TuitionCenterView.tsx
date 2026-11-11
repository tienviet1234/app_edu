import { useMemo, useState } from 'react'
import { useActionLock } from '@/hooks/useActionLock'
import { markPaidConfirm } from '@/business/tuitionActions'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { overviewService } from '@/services/overview'
import { tuitionNoticeService } from '@/services/tuitionNotices'
import { toast } from '@/store/toastStore'
import { todayISO } from '@/utils/format'
import {
  tuitionOverviewRows, tuitionOverviewSummary, filterTuitionRows,
  type TuitionOverviewRow, type TuitionFilter, type Att, type TuitionOverviewNotice,
} from '@/business/tuitionOverview'

const money = (n: number) => `${Math.round(n).toLocaleString('vi-VN')}đ`
const dm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')
const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const wd = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()]
const daysAgo = (d: string) => Math.round((Date.parse(`${todayISO()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5)
const ATT: Record<Att, { sym: string; label: string; color: string }> = {
  present: { sym: '✓', label: 'Có mặt', color: C.emerald },
  late: { sym: 'M', label: 'Đi muộn', color: C.amber },
  excused: { sym: 'P', label: 'Nghỉ có phép', color: C.blue },
  absent: { sym: 'V', label: 'Nghỉ không phép', color: C.rose },
}
const STATUS: Record<TuitionOverviewRow['kind'], { label: string; color: string }> = {
  blocked: { label: 'Chưa gửi được', color: C.amber },
  due: { label: 'Đến hạn gửi phiếu', color: C.board },
  debt: { label: 'Đang nợ', color: C.rose },
  progress: { label: 'Đang học dở kỳ', color: C.muted },
  done: { label: 'Đã đóng đủ', color: C.emerald },
}

function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-bold" style={{ background: `${color}1A`, color }}>{children}</span>
}

/** Thanh tiến độ kỳ: mỗi ô 1 buổi, màu theo điểm danh (vắng không phép = ô rỗng viền đỏ). */
function PeriodBar({ row }: { row: TuitionOverviewRow }) {
  const cells = row.due ? row.due.sessions.map((s) => s.att) : row.progressSessions.map((s) => s.att)
  const count = cells.length
  return (
    <div className="flex items-center gap-[2px]" title={`${count}/${row.perMonth} buổi`}>
      {Array.from({ length: row.perMonth }, (_, i) => {
        const a = cells[i]
        return <i key={i} className="inline-block h-4 w-[10px] rounded-[3px]" style={a ? (a === 'absent' ? { boxShadow: `inset 0 0 0 1.5px ${C.rose}`, background: C.card } : { background: ATT[a].color }) : { background: C.line }} />
      })}
      <span className="ml-2 whitespace-nowrap text-xs font-bold tabular-nums" style={{ color: C.ink }}>
        {count}/{row.perMonth}
        {row.due && row.afterDue > 0 && <span className="font-medium" style={{ color: C.muted }}> +{row.afterDue} kỳ sau</span>}
      </span>
    </div>
  )
}

function StatusCell({ row }: { row: TuitionOverviewRow }) {
  const s = STATUS[row.kind]
  const last = row.notices.at(-1)
  let sub = ''
  if (row.kind === 'blocked') sub = `Kỳ đến hạn có 2 buổi cùng ngày ${row.due!.duplicates.map(dm).join(', ')}`
  else if (row.kind === 'due') sub = `${row.due!.count} buổi · ${dm(row.due!.from)}–${dm(row.due!.to)}${row.dueCount > 1 ? ` · còn ${row.dueCount - 1} kỳ nữa` : ''}`
  else if (row.kind === 'debt') { const d = daysAgo(row.unpaid[0].sentAt); sub = `${row.unpaid[0].label} · gửi ${dm(row.unpaid[0].sentAt)} · ${d <= 0 ? 'hôm nay' : `${d} ngày trước`}` }
  else if (last) sub = `${last.label} · ${last.status === 'paid' ? `đóng ${dm(last.paidAt ?? '')}` : 'chưa đóng'}`
  else sub = row.progress ? 'Chưa có phiếu nào' : 'Chưa có buổi nào'
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        <Chip color={s.color}>{row.kind === 'progress' && last ? 'Đã đóng kỳ trước' : row.kind === 'progress' ? 'Chưa có phiếu' : s.label}</Chip>
        {row.kind === 'due' && row.debt > 0 && <Chip color={C.rose}>Kỳ trước còn nợ</Chip>}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{sub}</div>
    </div>
  )
}

function AmountCell({ row }: { row: TuitionOverviewRow }) {
  return (
    <div className="text-right tabular-nums">
      {row.due && <div><b style={{ color: C.ink }}>{money(row.due.amount)}</b><div className="text-xs" style={{ color: C.muted }}>kỳ đến hạn</div></div>}
      {row.debt > 0 && <div className={row.due ? 'mt-1' : ''}><b style={{ color: C.rose }}>{money(row.debt)}</b><div className="text-xs" style={{ color: C.muted }}>còn nợ</div></div>}
      {!row.due && !row.debt && row.progress && <div><span style={{ color: C.muted }}>~{money(row.estimate)}</span><div className="text-xs" style={{ color: C.muted }}>tạm tính</div></div>}
    </div>
  )
}

export interface TuitionCenterViewProps {
  isAdmin: boolean
  /** Mở màn học phí theo lớp (gửi phiếu, sửa số buổi… làm ở đó như cũ). */
  onOpenClass: (classId: string, studentName: string) => void
}

export function TuitionCenterView({ isAdmin, onOpenClass }: TuitionCenterViewProps) {
  const qc = useQueryClient()
  const { data, isLoading, isFetching, error, refetch } = useQuery({ queryKey: ['center-overview'], queryFn: overviewService.center, staleTime: 0, refetchOnMount: 'always' })
  const [status, setStatus] = useState<TuitionFilter>('action')
  const [classId, setClassId] = useState('')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const lock = useActionLock()
  const rows = useMemo(() => (data ? tuitionOverviewRows(data) : []), [data])
  const sum = useMemo(() => tuitionOverviewSummary(rows, todayISO().slice(0, 7)), [rows])
  const shown = useMemo(() => filterTuitionRows(rows, { status, classId, query }), [rows, status, classId, query])
  const open = rows.find((r) => r.key === openKey) ?? null
  const classes = data?.classes.filter((c) => c.students.length) ?? []

  // Khóa theo phiếu bằng ref (useActionLock): 2 cú bấm liền không mở 2 hộp hỏi / gửi 2 lần.
  async function markPaid(row: TuitionOverviewRow, n: TuitionOverviewNotice) {
    await lock.run(`notice:${n.id}`, () => markPaidLocked(row, n))
  }

  async function markPaidLocked(row: TuitionOverviewRow, n: TuitionOverviewNotice) {
    if (!confirm(markPaidConfirm(row.studentName, { periodLabel: n.label, finalAmount: n.amount }, row.className))) return
    setBusy(n.id)
    try {
      await tuitionNoticeService.markPaid(n.id)
      await qc.invalidateQueries({ queryKey: ['center-overview'] })
      toast.success(`Đã ghi nhận ${row.studentName} đóng ${money(n.amount)}.`)
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`${msg ?? 'Lỗi khi ghi nhận đã đóng.'} Chưa ghi gì — thử lại.`, { persist: true })
    } finally {
      setBusy(null)
    }
  }

  function Action({ row, compact = false }: { row: TuitionOverviewRow; compact?: boolean }) {
    if (row.kind === 'blocked') return <Btn size="sm" kind="ghost" onClick={() => onOpenClass(row.classId, row.studentName)}>{compact ? 'Xử lý' : `Xử lý 2 buổi trùng ${row.due!.duplicates.map(dm).join(', ')}`}</Btn>
    if (row.kind === 'due') return (
      <div className="flex flex-col items-end gap-1.5">
        <Btn size="sm" kind="solid" onClick={() => onOpenClass(row.classId, row.studentName)}>{compact ? 'Gửi phiếu' : `Gửi phiếu ${money(row.due!.amount)}`}</Btn>
        {/* Vừa đến hạn kỳ mới vừa còn nợ kỳ trước (VD Mỹ Hân): phải ghi nhận đóng được ngay tại đây. */}
        {row.unpaid[0] && <Btn size="sm" kind="gold" loading={busy === row.unpaid[0].id} onClick={() => markPaid(row, row.unpaid[0])}>{compact ? 'Đã đóng kỳ trước' : 'Ghi nhận đã đóng kỳ trước'}</Btn>}
      </div>
    )
    if (row.kind === 'debt') return <Btn size="sm" kind="gold" loading={busy === row.unpaid[0].id} onClick={() => markPaid(row, row.unpaid[0])}>{compact ? 'Đã đóng' : 'Ghi nhận đã đóng'}</Btn>
    if (row.kind === 'progress') return <span className="text-xs" style={{ color: C.muted }}>Chờ đủ {row.perMonth} buổi</span>
    return null
  }

  if (error) return (
    <div className="rounded-2xl p-6 text-center" style={{ background: C.card }}>
      <div className="font-bold" style={{ color: C.red }}>Không tải được dữ liệu học phí toàn trung tâm.</div>
      <div className="mt-1 text-sm" style={{ color: C.muted }}>Kiểm tra mạng rồi thử lại. Màn "Theo lớp" vẫn dùng được.</div>
      <div className="mt-3"><Btn onClick={() => refetch()}>Thử lại</Btn></div>
    </div>
  )
  if (isLoading || !data) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Đang tải học phí của cả trung tâm…</div>

  const TABS: Array<[TuitionFilter, string, number]> = [
    ['action', 'Cần làm', rows.filter((r) => r.group === 0).length],
    ['debt', 'Đang nợ', sum.debt.count],
    ['due', 'Đến hạn gửi', sum.due.count + sum.blocked],
    ['progress', 'Đang học dở kỳ', sum.inProgress.count],
    ['done', 'Đã đóng đủ', sum.done],
    ['all', 'Tất cả', rows.length],
  ]
  const stat = (label: string, value: string, color: string, sub?: string) => (
    <div className="min-w-0 flex-1 px-4 py-3 last:col-span-2 md:min-w-[150px]">
      <div className="text-xs font-semibold" style={{ color: C.muted }}>{label}</div>
      <div className="whitespace-nowrap"><b className="text-lg tabular-nums" style={{ color }}>{value}</b>{sub && <> <span className="ml-1 text-xs" style={{ color: C.muted }}>{sub}</span></>}</div>
    </div>
  )

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 rounded-2xl shadow-sm md:flex md:divide-x" style={{ background: C.card, borderColor: C.line }}>
        {stat('Đang nợ', money(sum.debt.amount), C.rose, `${sum.debt.count} em`)}
        {stat('Đến hạn gửi phiếu', money(sum.due.amount), C.board, `${sum.due.count} em`)}
        {stat('Chưa gửi được', String(sum.blocked), sum.blocked ? C.amber : C.muted, 'em cần xử lý')}
        {stat(`Đã thu tháng ${Number(todayISO().slice(5, 7))}`, money(sum.paidThisMonth), C.emerald)}
        {stat('Đang học dở kỳ', String(sum.inProgress.count), C.ink, `em · tạm tính ${money(sum.inProgress.estimate)}`)}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setStatus(k)} className="whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold"
              style={status === k ? { background: C.board, color: '#fff' } : { background: C.card, color: C.ink, border: `1px solid ${C.line}` }}>
              {label} <span className="ml-1 rounded-full px-1.5 text-[11px]" style={{ background: status === k ? 'rgba(255,255,255,.2)' : C.paper }}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Lọc theo lớp" className="rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ border: `1px solid ${C.line}`, background: C.card }}>
          <option value="">Tất cả lớp</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên học sinh" aria-label="Tìm tên học sinh" className="w-44 rounded-xl px-3 py-1.5 text-sm" style={{ border: `1px solid ${C.line}`, background: C.card }} />
        <Btn size="sm" onClick={async () => {
          const { exportCenterTuition } = await import('@/utils/excel')
          exportCenterTuition(shown.map((r) => ({
            className: r.className, studentName: r.studentName, status: STATUS[r.kind].label,
            dueSessions: r.due?.count ?? '', dueAmount: r.due?.amount ?? '', debt: r.debt || '',
            progress: r.due ? `${r.due.count}/${r.perMonth}` : r.progress ? `${r.progress.current}/${r.progress.total}` : '',
            estimate: r.progress ? r.estimate : '', lastNotice: r.notices.at(-1) ? `${r.notices.at(-1)!.label} · ${r.notices.at(-1)!.status === 'paid' ? 'đã đóng' : 'chưa đóng'}` : '', rate: r.rate,
          })))
        }}>Xuất Excel</Btn>
        {isFetching && <span className="text-xs" style={{ color: C.muted }}>Đang cập nhật…</span>}
      </div>

      {!shown.length ? (
        <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>
          {status === 'action' ? 'Không có việc học phí nào cần làm lúc này.' : 'Không có học sinh nào khớp bộ lọc.'}
        </div>
      ) : (
        <>
          {/* Máy tính: bảng */}
          <div className="hidden overflow-hidden rounded-2xl shadow-sm md:block" style={{ background: C.card }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: C.muted, borderBottom: `1px solid ${C.line}` }}>
                  <th className="px-4 py-2.5 font-semibold">Học sinh</th>
                  <th className="px-2 py-2.5 font-semibold">Kỳ đang học</th>
                  <th className="px-2 py-2.5 font-semibold">Tình trạng</th>
                  <th className="px-2 py-2.5 text-right font-semibold">Số tiền</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Việc cần làm</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} data-row={r.studentName} data-class={r.className} onClick={() => setOpenKey(r.key)} className="cursor-pointer hover:brightness-[0.98]" style={{ borderTop: `1px solid ${C.paper}`, background: C.card }}>
                    <td className="px-4 py-2.5"><b className="block" style={{ color: C.ink }}>{r.studentName}</b><span className="text-xs" style={{ color: C.muted }}>{r.className} · {money(r.rate)}/buổi</span></td>
                    <td className="px-2 py-2.5"><PeriodBar row={r} /></td>
                    <td className="px-2 py-2.5"><StatusCell row={r} /></td>
                    <td className="px-2 py-2.5"><AmountCell row={r} /></td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}><Action row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Điện thoại: danh sách */}
          <div className="overflow-hidden rounded-2xl shadow-sm md:hidden" style={{ background: C.card }}>
            {shown.map((r) => (
              <div key={r.key} data-row={r.studentName} data-class={r.className} onClick={() => setOpenKey(r.key)} className="flex gap-3 px-3.5 py-3" style={{ borderTop: `1px solid ${C.paper}` }}>
                <div className="min-w-0 flex-1">
                  <div><b style={{ color: C.ink }}>{r.studentName}</b> <span className="text-xs" style={{ color: C.muted }}>{r.className}</span></div>
                  <div className="my-1.5"><PeriodBar row={r} /></div>
                  <StatusCell row={r} />
                </div>
                <div className="flex flex-none flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}><AmountCell row={r} /><Action row={r} compact /></div>
              </div>
            ))}
          </div>
        </>
      )}
      {!isAdmin && <p className="mt-2 text-xs" style={{ color: C.muted }}>Chỉ hiện các lớp bạn đang dạy.</p>}

      {open && <StudentDrawer row={open} busy={busy} onClose={() => setOpenKey(null)} onMarkPaid={(n) => markPaid(open, n)} onOpenClass={() => onOpenClass(open.classId, open.studentName)} />}
    </div>
  )
}

function StudentDrawer({ row, busy, onClose, onMarkPaid, onOpenClass }: {
  row: TuitionOverviewRow; busy: string | null; onClose: () => void; onMarkPaid: (n: TuitionOverviewNotice) => void; onOpenClass: () => void
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label={`Học phí ${row.studentName}`}>
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,.32)' }} onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 top-14 flex flex-col overflow-hidden rounded-t-2xl shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[470px] md:rounded-none" style={{ background: C.card }}>
        <div className="flex items-start gap-3 px-5 py-4 text-white" style={{ background: C.gradHeader }}>
          <div className="min-w-0 flex-1">
            <div className="text-xs opacity-80">{row.className} · {money(row.rate)}/buổi · {row.perMonth} buổi/kỳ</div>
            <div className="text-xl font-extrabold">{row.studentName}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg px-2 py-1 text-lg font-bold hover:brightness-110" style={{ background: 'rgba(255,255,255,.15)' }}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {row.notices.map((n, i) => (
            <div key={n.id} className="my-2.5 rounded-xl" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                <b style={{ color: C.ink }}>Kỳ {i + 1} · {n.label}</b>
                <Chip color={n.status === 'paid' ? C.emerald : C.rose}>{n.status === 'paid' ? 'Đã đóng' : 'Đang nợ'}</Chip>
                <b className="ml-auto tabular-nums" style={{ color: C.ink }}>{money(n.amount)}</b>
              </div>
              <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2.5 text-xs" style={{ color: C.muted }}>
                <span>{n.sessionsBilled} buổi tính tiền · gửi {dm(n.sentAt)}{n.paidAt ? ` · đóng ${dm(n.paidAt)}` : ''}</span>
                {n.status === 'unpaid' && <span className="ml-auto"><Btn size="sm" kind="gold" loading={busy === n.id} onClick={() => onMarkPaid(n)}>Ghi nhận đã đóng</Btn></span>}
              </div>
            </div>
          ))}
          {row.due && (
            <div className="my-2.5 rounded-xl" style={{ border: `1px solid ${C.board2}55`, boxShadow: `0 0 0 3px ${C.board2}14` }}>
              <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                <b style={{ color: C.ink }}>Kỳ {row.notices.length + 1} · {row.due.count} buổi</b>
                <Chip color={row.kind === 'blocked' ? C.amber : C.board}>{row.kind === 'blocked' ? 'Chưa gửi được' : 'Đến hạn gửi phiếu'}</Chip>
                <b className="ml-auto tabular-nums" style={{ color: C.ink }}>{money(row.due.amount)}</b>
              </div>
              <div className="px-3.5 pb-2.5">
                {row.due.sessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 py-1 text-[13px]">
                    <span className="w-16 tabular-nums" style={{ color: row.due!.duplicates.includes(s.date) ? C.amber : C.muted, fontWeight: row.due!.duplicates.includes(s.date) ? 700 : 400 }}>{wd(s.date)} {dm(s.date)}</span>
                    <span className="grid h-5 w-5 place-items-center rounded-md text-[11px] font-extrabold text-white" style={{ background: ATT[s.att].color }}>{ATT[s.att].sym}</span>
                    <span style={{ color: C.ink }}>{ATT[s.att].label}</span>
                    <b className="ml-auto tabular-nums" style={{ color: s.total == null ? C.muted : s.total >= 80 ? C.scoreHigh : s.total >= 65 ? C.scoreMid : C.scoreLow }}>{s.total ?? '—'}</b>
                  </div>
                ))}
                <p className="mt-1 text-xs" style={{ color: C.muted }}>Nghỉ có phép vẫn tính tiền · chỉ nghỉ không phép là không tính.{row.kind === 'blocked' ? ' Ngày tô vàng có 2 buổi — xử lý ở "Sửa số buổi" trước khi gửi.' : ''}</p>
              </div>
            </div>
          )}
          {!row.due && row.progress && (
            <div className="my-2.5 rounded-xl px-3.5 py-2.5" style={{ border: `1px dashed ${C.line}` }}>
              <div className="flex items-center gap-2"><b style={{ color: C.ink }}>Kỳ đang học</b><span className="ml-auto text-sm tabular-nums" style={{ color: C.muted }}>{row.progress.current}/{row.progress.total} buổi · tạm tính {money(row.estimate)}</span></div>
            </div>
          )}
          {!row.notices.length && !row.due && !row.progress && <p className="py-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học hay phiếu nào.</p>}
        </div>
        <div className="flex gap-2.5 px-5 py-3.5" style={{ borderTop: `1px solid ${C.line}` }}>
          <Btn kind={row.kind === 'due' ? 'solid' : 'ghost'} className="flex-1 justify-center" onClick={onOpenClass}>
            {row.kind === 'due' ? `Gửi phiếu ${money(row.due!.amount)} ở màn lớp` : row.kind === 'blocked' ? 'Mở lớp để xử lý buổi trùng' : `Mở học phí ${row.className}`}
          </Btn>
        </div>
      </div>
    </div>
  )
}
