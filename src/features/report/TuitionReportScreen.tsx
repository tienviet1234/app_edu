import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getClassRubric } from '@/constants/rubrics'
import { statsOf } from '@/business/stats'
import { buildComment, sessionDetailsOf, type SessionDetailRow } from '@/business/report'
import { billingPeriodsOf, sessionsBilledOf, currentProgressOf } from '@/business/tuition'
import { isMongoid } from '@/utils/mongoid'
import { viDate } from '@/utils/format'
import { exportTuitionNotices, exportTuitionOverview } from '@/utils/excel'
import { classService } from '@/services/classes'
import { tuitionNoticeService, type TuitionNotice } from '@/services/tuitionNotices'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  cls: ClassData
}

interface DueRow {
  studentId: string
  studentName: string
  periodFrom: number
  periodTo: number
  periodLabel: string
  sessionsBilled: number
  computedAmount: number
  finalAmount: string
  adjustmentReason: string
  reportComment: string
  sessionDetails: SessionDetailRow[]
  showDetails: boolean
  saving: boolean
}

function fmtVnd(n: number): string {
  return n.toLocaleString('vi-VN') + 'đ'
}

/** Ghép sẵn nội dung tin nhắn gửi phụ huynh (qua Zalo, hoặc bất kỳ kênh nào
 *  giáo viên đang dùng) — chỉ để DÁN RA GỬI TAY, không tự động gửi đi đâu cả
 *  (Zalo không có cách mở sẵn khung chat kèm tin nhắn như WhatsApp, nên chưa
 *  làm được nút "gửi thẳng"). */
function buildZaloMessage(className: string, row: DueRow, rate: number): string {
  const amount = Number(row.finalAmount) || row.computedAmount
  return [
    `📚 BÁO CÁO HỌC TẬP — ${className}`,
    `Con: ${row.studentName}`,
    `Kỳ: ${row.periodLabel}`,
    '',
    row.reportComment,
    '',
    `💰 Học phí kỳ này: ${row.sessionsBilled} buổi × ${fmtVnd(rate)} = ${fmtVnd(amount)}`,
    row.adjustmentReason ? `(${row.adjustmentReason})` : '',
    '',
    'Cảm ơn quý phụ huynh đã đồng hành cùng con!',
  ].filter((line) => line !== '').join('\n')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

export function TuitionReportScreen({ cls }: Props) {
  const r = getClassRubric(cls)
  const [rate, setRate] = useState<number | null>(null)
  const [loadingRate, setLoadingRate] = useState(true)
  const [notices, setNotices] = useState<TuitionNotice[]>([])
  const [dueRows, setDueRows] = useState<DueRow[]>([])
  const [showPaidHistory, setShowPaidHistory] = useState(false)
  const [expandedOverview, setExpandedOverview] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isMongoid(cls.id)) return
    setLoadingRate(true)
    Promise.all([
      classService.get(cls.id),
      tuitionNoticeService.list(cls.id),
    ]).then(([apiCls, noticeList]) => {
      setRate(apiCls.tuitionPerSession ?? null)
      setNotices(noticeList)
    }).finally(() => setLoadingRate(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id])

  useEffect(() => {
    if (rate == null) { setDueRows([]); return }
    const sentKeys = new Set(notices.map((n) => `${n.studentId}:${n.periodFrom}-${n.periodTo}`))
    const rows: DueRow[] = []
    cls.students.forEach((st) => {
      billingPeriodsOf(st, cls.perMonth).forEach((p) => {
        const key = `${st.id}:${p.from}-${p.to}`
        if (sentKeys.has(key)) return
        const sessionsBilled = sessionsBilledOf(st, p.from, p.to)
        const computedAmount = sessionsBilled * rate
        const s = statsOf(cls, st.sessions.slice(p.from, p.to))
        rows.push({
          studentId: st.id, studentName: st.name,
          periodFrom: p.from, periodTo: p.to, periodLabel: p.label,
          sessionsBilled, computedAmount,
          finalAmount: String(computedAmount), adjustmentReason: '',
          reportComment: buildComment(st.name, s, r),
          sessionDetails: sessionDetailsOf(st, p.from, p.to, r),
          showDetails: false,
          saving: false,
        })
      })
    })
    setDueRows(rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, notices, cls])

  // Học sinh CHƯA tới hạn (còn đang học dở kỳ) — vẫn hiện đầy đủ cả lớp
  // thay vì chỉ hiện em đã tới hạn, để thấy tiến độ ai cũng đang được theo
  // dõi, không phải "biến mất" khỏi màn hình cho tới khi tới hạn.
  const dueStudentIds = new Set(dueRows.map((r) => r.studentId))
  const notDueRows = useMemo(
    () => cls.students
      .filter((st) => !dueStudentIds.has(st.id))
      .map((st) => {
        const progress = currentProgressOf(st, cls.perMonth)
        if (!progress) return null
        const to = st.sessions.length
        const from = to - progress.current
        return { studentId: st.id, studentName: st.name, progress, from, to }
      })
      .filter((x): x is { studentId: string; studentName: string; progress: { current: number; total: number }; from: number; to: number } => x != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cls, dueRows],
  )

  function patchRow(key: string, fn: (r: DueRow) => void) {
    setDueRows((prev) => prev.map((r) => {
      if (`${r.studentId}:${r.periodFrom}-${r.periodTo}` !== key) return r
      const copy = { ...r }
      fn(copy)
      return copy
    }))
  }

  async function markSent(row: DueRow) {
    const finalAmount = Number(row.finalAmount)
    if (Number.isNaN(finalAmount) || finalAmount < 0) {
      toast.error('Số tiền không hợp lệ.')
      return
    }
    if (finalAmount !== row.computedAmount && !row.adjustmentReason.trim()) {
      toast.error('Số tiền khác số tự tính — bắt buộc ghi lý do điều chỉnh.')
      return
    }
    const key = `${row.studentId}:${row.periodFrom}-${row.periodTo}`
    patchRow(key, (r) => { r.saving = true })
    try {
      const created = await tuitionNoticeService.create({
        classId: cls.id, studentId: row.studentId,
        periodFrom: row.periodFrom, periodTo: row.periodTo, periodLabel: row.periodLabel,
        sessionsBilled: row.sessionsBilled, ratePerSession: rate ?? 0,
        computedAmount: row.computedAmount, finalAmount,
        adjustmentReason: row.adjustmentReason.trim() || undefined,
        reportComment: row.reportComment,
      })
      setNotices((prev) => [created, ...prev])
      toast.success(`Đã đánh dấu gửi cho ${row.studentName}.`)
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Lỗi khi lưu — thử lại.'
      toast.error(msg)
    } finally {
      patchRow(key, (r) => { r.saving = false })
    }
  }

  async function undoSent(notice: TuitionNotice) {
    if (!confirm(`Hoàn tác "đã gửi" cho kỳ ${notice.periodLabel}? Dùng khi ghi nhầm — sau đó có thể ghi lại cho đúng.`)) return
    try {
      await tuitionNoticeService.remove(notice._id)
      setNotices((prev) => prev.filter((n) => n._id !== notice._id))
      toast.success('Đã hoàn tác.')
    } catch {
      toast.error('Lỗi khi hoàn tác — thử lại.')
    }
  }

  /** Đánh dấu ĐÃ THU ĐƯỢC TIỀN — khác hẳn "đã gửi" ở trên, ghi nhận lúc phụ
   *  huynh THỰC SỰ đóng, có thể trễ hơn lúc gửi rất nhiều. */
  async function markPaid(notice: TuitionNotice) {
    try {
      const updated = await tuitionNoticeService.markPaid(notice._id)
      setNotices((prev) => prev.map((n) => (n._id === updated._id ? updated : n)))
      toast.success('Đã đánh dấu đóng tiền.')
    } catch {
      toast.error('Lỗi — thử lại.')
    }
  }

  async function undoPaid(notice: TuitionNotice) {
    try {
      const updated = await tuitionNoticeService.markUnpaid(notice._id)
      setNotices((prev) => prev.map((n) => (n._id === updated._id ? updated : n)))
      toast.success('Đã chuyển lại về "chưa đóng".')
    } catch {
      toast.error('Lỗi — thử lại.')
    }
  }

  async function copyMessage(row: DueRow) {
    const ok = await copyToClipboard(buildZaloMessage(cls.name, row, rate ?? 0))
    if (ok) toast.success('Đã sao chép — dán vào Zalo/Messenger để gửi phụ huynh.')
    else toast.error('Không sao chép được — thử lại hoặc bấm giữ để tự chọn/sao chép.')
  }

  function exportDue() {
    if (!dueRows.length) return
    exportTuitionNotices(
      cls.name,
      dueRows.map((r) => ({
        studentName: r.studentName,
        periodLabel: r.periodLabel,
        sessionsBilled: r.sessionsBilled,
        ratePerSession: rate ?? 0,
        finalAmount: Number(r.finalAmount) || 0,
        adjustmentReason: r.adjustmentReason || undefined,
        reportComment: r.reportComment,
        sentAtLabel: '(chưa gửi — bản nháp)',
      })),
      dueRows.flatMap((r) => r.sessionDetails.map((d) => ({ studentName: r.studentName, ...d }))),
    )
  }

  // Bảng "Tổng quan" dùng CHUNG cho cả hiển thị trên màn hình LẪN xuất Excel
  // — tính 1 lần duy nhất ở đây để 2 nơi không bao giờ lệch nhau (trước đây
  // phải tự nhớ sửa cả 2 chỗ mỗi khi đổi logic, dễ quên 1 nơi). MỌI dòng đều
  // kèm sessionDetails (kể cả "Chưa tới hạn" — lấy đúng các buổi ĐÃ học
  // trong kỳ đang dở) để admin/giáo viên đọc được tình hình từng buổi ngay
  // trên app, không cần tải Excel mới biết.
  const overviewRows = useMemo(() => {
    const unpaid = notices.filter((n) => n.paymentStatus === 'unpaid')
    const paid = notices.filter((n) => n.paymentStatus === 'paid')
    return [
      ...dueRows.map((row) => ({
        studentId: row.studentId, studentName: row.studentName,
        status: '🔴 Đã tới hạn - chưa gửi' as const,
        periodLabel: row.periodLabel,
        sessionsBilled: String(row.sessionsBilled),
        finalAmount: fmtVnd(Number(row.finalAmount) || row.computedAmount),
        adjustmentReason: row.adjustmentReason || undefined,
        reportComment: row.reportComment,
        sessionDetails: row.sessionDetails,
      })),
      ...unpaid.map((n) => {
        const st = cls.students.find((s) => s.id === n.studentId)
        return {
          studentId: n.studentId, studentName: st?.name ?? '(học sinh đã xoá)',
          status: 'Đang nợ (đã gửi, chưa đóng)' as const,
          periodLabel: n.periodLabel,
          sessionsBilled: String(n.sessionsBilled),
          finalAmount: fmtVnd(n.finalAmount),
          adjustmentReason: n.adjustmentReason,
          reportComment: n.reportComment,
          sessionDetails: st ? sessionDetailsOf(st, n.periodFrom, n.periodTo, r) : [],
        }
      }),
      ...paid.map((n) => {
        const st = cls.students.find((s) => s.id === n.studentId)
        return {
          studentId: n.studentId, studentName: st?.name ?? '(học sinh đã xoá)',
          status: 'Đã đóng xong' as const,
          periodLabel: n.periodLabel,
          sessionsBilled: String(n.sessionsBilled),
          finalAmount: fmtVnd(n.finalAmount),
          adjustmentReason: n.adjustmentReason,
          reportComment: n.reportComment,
          sessionDetails: st ? sessionDetailsOf(st, n.periodFrom, n.periodTo, r) : [],
        }
      }),
      ...notDueRows.map((nd) => {
        const st = cls.students.find((s) => s.id === nd.studentId)
        return {
          studentId: nd.studentId, studentName: nd.studentName,
          status: 'Chưa tới hạn' as const,
          periodLabel: `Đang học dở — buổi ${nd.from + 1}–${nd.to}`,
          sessionsBilled: `${nd.progress.current}/${nd.progress.total}`,
          finalAmount: '—',
          adjustmentReason: undefined as string | undefined,
          reportComment: '—',
          sessionDetails: st ? sessionDetailsOf(st, nd.from, nd.to, r) : [],
        }
      }),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueRows, notices, notDueRows, cls])

  function toggleOverview(studentId: string) {
    setExpandedOverview((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  /** Xuất Excel "Tổng quan" — gộp CẢ 4 trạng thái đang hiện trên màn hình
   *  (đã tới hạn chưa gửi / đang nợ đã gửi / đã đóng xong / chưa tới hạn),
   *  khớp đúng y như bảng đang hiện trên app — khác nút "Xuất Excel" nhanh
   *  phía trên (chỉ xuất phần "chưa gửi" để chuẩn bị gửi ngay). */
  function exportAll() {
    exportTuitionOverview(
      cls.name,
      overviewRows.map(({ sessionDetails: _sd, ...rest }) => rest),
      overviewRows.flatMap((row) => row.sessionDetails.map((d) => ({ studentName: row.studentName, ...d }))),
    )
  }

  /** Xuất Excel CHỈ 1 học sinh (bất kỳ trạng thái nào — đã tới hạn/đang
   *  nợ/đã đóng/chưa tới hạn) — dùng khi gửi riêng cho đúng phụ huynh em đó,
   *  tránh file gộp (nút "Xuất Excel Tổng quan") lộ học phí của em khác. */
  function exportOneRow(row: (typeof overviewRows)[number]) {
    const { sessionDetails, ...rest } = row
    exportTuitionOverview(
      `${cls.name}_${row.studentName}`,
      [rest],
      sessionDetails.map((d) => ({ studentName: row.studentName, ...d })),
    )
  }

  if (!isMongoid(cls.id)) {
    return (
      <Card className="p-6 text-center text-sm" style={{ color: C.muted }}>
        Lớp này chưa đồng bộ lên máy chủ — cần lớp đã lưu trên server để dùng tính năng này.
      </Card>
    )
  }
  if (loadingRate) {
    return <div className="py-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
  }
  if (rate == null) {
    return (
      <Card className="p-6 text-center text-sm" style={{ color: C.muted }}>
        Lớp này chưa có đơn giá học phí/buổi — nhờ admin thiết lập ở màn Quản trị trước khi dùng tính năng này.
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-1">
        <div className="text-lg font-bold" style={{ color: C.ink }}>💰 Báo cáo học tập + Học phí — {cls.name}</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Tự động xác định học sinh đã đủ mốc "cuối 8/12 buổi" chưa gửi báo cáo — tính sẵn số buổi tính phí
          (chỉ tính buổi có mặt/muộn, không tính buổi nghỉ) × đơn giá {fmtVnd(rate)}/buổi. Bạn xem lại, sửa số
          tiền nếu có ngoại lệ, bấm "Sao chép nội dung" để dán vào Zalo gửi tay (Zalo chưa hỗ trợ gửi thẳng từ
          web), hoặc xuất Excel cả loạt (kèm sheet chi tiết TỪNG BUỔI — bài giao, tình hình) — xong thì đánh dấu
          đã gửi để không bị nhắc lại.
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
          <div className="text-lg font-bold">Tổng quan — {overviewRows.length} học sinh</div>
          <div className="text-xs opacity-80">Đúng nội dung sẽ có trong file Excel khi bấm nút xuất bên dưới</div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: C.paper }}>
                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}></th>
                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Học sinh</th>
                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Trạng thái</th>
                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Kỳ</th>
                <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Số buổi</th>
                <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Số tiền</th>
                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Nhận xét</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {overviewRows.map((r, i) => {
                const bg =
                  r.status === '🔴 Đã tới hạn - chưa gửi' ? '#FEE2E2' :
                  r.status === 'Đang nợ (đã gửi, chưa đóng)' ? '#FFEDD5' :
                  r.status === 'Đã đóng xong' ? '#ECFDF5' : undefined
                const rowKey = `${r.studentId}-${i}`
                const isOpen = expandedOverview.has(rowKey)
                return (
                  <Fragment key={rowKey}>
                    <tr style={{ borderTop: `1px solid ${C.line}`, background: bg }}>
                      <td className="py-1.5 pl-3">
                        {r.sessionDetails.length > 0 && (
                          <button onClick={() => toggleOverview(rowKey)} style={{ color: C.muted }}>
                            {isOpen ? '▾' : '▸'}
                          </button>
                        )}
                      </td>
                      <td className="py-1.5 px-3 font-semibold" style={{ color: C.ink }}>{r.studentName}</td>
                      <td className="py-1.5 px-3">{r.status}</td>
                      <td className="py-1.5 px-3" style={{ color: C.muted }}>{r.periodLabel}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{r.sessionsBilled}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold" style={{ color: C.ink }}>{r.finalAmount}</td>
                      <td className="py-1.5 px-3 max-w-[220px] truncate" style={{ color: C.muted }} title={r.reportComment}>
                        {r.reportComment}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <button className="font-semibold" style={{ color: C.board2 }} onClick={() => exportOneRow(r)}>
                          📥 Xuất
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: '#FAFAFA' }}>
                        <td colSpan={8} className="p-2">
                          <table className="w-full text-xs" style={{ border: `1px solid ${C.line}` }}>
                            <thead>
                              <tr style={{ background: C.paper }}>
                                <th className="py-1 px-2 text-left" style={{ color: C.muted }}>Buổi</th>
                                <th className="py-1 px-2 text-left" style={{ color: C.muted }}>Ngày</th>
                                <th className="py-1 px-2 text-left" style={{ color: C.muted }}>Bài tập về nhà</th>
                                <th className="py-1 px-2 text-left" style={{ color: C.muted }}>Tình hình buổi đó</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.sessionDetails.map((d) => (
                                <tr key={d.no} style={{ borderTop: `1px solid ${C.line}` }}>
                                  <td className="py-1 px-2 font-semibold">{d.no}</td>
                                  <td className="py-1 px-2" style={{ color: C.muted }}>{viDate(d.date)}</td>
                                  <td className="py-1 px-2" style={{ color: C.muted }}>{d.homework || '—'}</td>
                                  <td className="py-1 px-2" style={d.isAuto ? { color: C.muted, fontStyle: 'italic' } : { color: C.ink }}>
                                    {d.status}
                                    {d.isAuto && <span className="ml-1 not-italic" style={{ color: C.board2 }} title="Tự sinh từ điểm số đã chấm">🤖</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Btn kind="ghost" onClick={exportAll}>
        📊 Xuất Excel Tổng quan (toàn lớp — đủ cả 4 trạng thái như đang xem trên màn hình)
      </Btn>

      {dueRows.length > 0 && (
        <div
          className="animate-pulse-red flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold"
          style={{ background: C.red, color: '#fff' }}
        >
          <span className="animate-blink text-lg leading-none">🔴</span>
          <span>
            {dueRows.length} HỌC SINH <span className="animate-blink">ĐÃ TỚI HẠN</span> — cần gửi báo cáo + học phí
            ngay (xem các thẻ viền đỏ bên dưới)!
          </span>
        </div>
      )}

      {dueRows.length > 0 && (
        <Btn kind="solid" onClick={exportDue}>📥 Xuất Excel ({dueRows.length} học sinh chưa gửi)</Btn>
      )}

      {dueRows.length === 0 ? (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>
          Không có học sinh nào đến mốc cần gửi báo cáo + học phí lúc này.
        </Card>
      ) : (
        dueRows.map((row) => {
          const key = `${row.studentId}:${row.periodFrom}-${row.periodTo}`
          const finalNum = Number(row.finalAmount)
          const differs = !Number.isNaN(finalNum) && finalNum !== row.computedAmount
          return (
            <Card
              key={key} className="animate-pulse-red p-4 space-y-2"
              style={{ border: `2px solid ${C.red}`, background: C.red + '0a' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="animate-blink rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: C.red }}
                    >
                      🔴 ĐÃ TỚI HẠN
                    </span>
                    <div className="font-bold" style={{ color: C.ink }}>{row.studentName}</div>
                  </div>
                  <div className="text-xs" style={{ color: C.muted }}>{row.periodLabel} — {row.sessionsBilled} buổi tính phí</div>
                </div>
                <div className="text-right text-xs" style={{ color: C.muted }}>
                  Tự tính: {fmtVnd(row.computedAmount)}
                </div>
              </div>
              <div className="rounded-lg p-2 text-xs" style={{ background: C.paper, color: C.ink }}>
                {row.reportComment}
              </div>

              {row.sessionDetails.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="text-xs font-semibold"
                    style={{ color: C.board2 }}
                    onClick={() => patchRow(key, (r) => { r.showDetails = !r.showDetails })}
                  >
                    {row.showDetails ? '▾' : '▸'} Chi tiết từng buổi ({row.sessionDetails.length})
                  </button>
                  {row.showDetails && (
                    <div className="mt-1.5 space-y-1.5">
                      {row.sessionDetails.map((d) => (
                        <div key={d.no} className="rounded-lg p-2 text-xs" style={{ border: `1px solid ${C.line}` }}>
                          <div className="font-semibold" style={{ color: C.ink }}>
                            Buổi {d.no} — {viDate(d.date)}
                          </div>
                          {d.homework && (
                            <div className="mt-0.5" style={{ color: C.muted }}>📝 Bài giao: {d.homework}</div>
                          )}
                          <div className="mt-0.5" style={d.isAuto ? { color: C.muted, fontStyle: 'italic' } : { color: C.ink }}>
                            {d.status || <span style={{ color: C.muted }}>(chưa có ghi chú buổi này)</span>}
                            {d.isAuto && <span className="ml-1 not-italic" style={{ color: C.board2 }} title="Tự sinh từ điểm số đã chấm, giáo viên không ghi chú buổi này">🤖</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: C.ink }}>Số tiền gửi (VNĐ)</label>
                  <input
                    type="number" min={0} value={row.finalAmount}
                    onChange={(e) => patchRow(key, (r) => { r.finalAmount = e.target.value })}
                    placeholder="VD: 450000"
                    className="w-32 rounded-xl px-3 py-2 text-sm text-right" style={{ border: `1px solid ${C.line}` }}
                  />
                  <div className="mt-0.5 text-[11px]" style={{ color: C.muted }}>Ghi đủ số 0, không chấm/phẩy — VD 450 nghìn thì gõ 450000</div>
                </div>
                {differs && (
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-semibold" style={{ color: '#991B1B' }}>
                      Lý do điều chỉnh (bắt buộc)
                    </label>
                    <input
                      type="text" value={row.adjustmentReason}
                      onChange={(e) => patchRow(key, (r) => { r.adjustmentReason = e.target.value })}
                      placeholder="VD: giảm giá học bù, nghỉ dịch..."
                      className="w-full rounded-xl px-3 py-2 text-sm"
                      style={{ border: `1px solid ${C.red}` }}
                    />
                  </div>
                )}
                <Btn kind="ghost" onClick={() => copyMessage(row)}>📋 Sao chép nội dung</Btn>
                <Btn
                  kind="ghost"
                  onClick={() => {
                    const ov = overviewRows.find((o) => o.studentId === row.studentId && o.status === '🔴 Đã tới hạn - chưa gửi')
                    if (ov) exportOneRow(ov)
                  }}
                >
                  📥 Xuất Excel riêng em này
                </Btn>
                <Btn kind="solid" onClick={() => markSent(row)} disabled={row.saving}>
                  {row.saving ? 'Đang lưu...' : '✅ Đánh dấu đã gửi'}
                </Btn>
              </div>
            </Card>
          )
        })
      )}

      {notDueRows.length > 0 && (
        <Card className="p-3">
          <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>
            Chưa tới hạn ({notDueRows.length}) — đang học dở kỳ
          </div>
          <div className="flex flex-wrap gap-1.5">
            {notDueRows.map((r) => (
              <span
                key={r.studentId}
                className="rounded-lg px-2 py-1 text-xs font-semibold"
                style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.muted }}
              >
                {r.studentName}: <b style={{ color: C.board2 }}>{r.progress!.current}/{r.progress!.total}</b> buổi
              </span>
            ))}
          </div>
        </Card>
      )}

      {(() => {
        const unpaid = notices.filter((n) => n.paymentStatus === 'unpaid')
        const paid = notices.filter((n) => n.paymentStatus === 'paid')
        return (
          <>
            <Card className="p-4 space-y-2" style={unpaid.length ? { border: `1.5px solid ${C.red}55` } : undefined}>
              <div className="text-sm font-bold" style={{ color: unpaid.length ? '#991B1B' : C.ink }}>
                📋 Đang nợ học phí {unpaid.length > 0 && `(${unpaid.length})`}
              </div>
              {unpaid.length === 0 ? (
                <div className="text-xs" style={{ color: C.muted }}>Không có khoản nào đang chờ đóng tiền.</div>
              ) : (
                <div className="space-y-1.5">
                  {unpaid.map((n) => {
                    const st = cls.students.find((s) => s.id === n.studentId)
                    return (
                      <div key={n._id} className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs" style={{ background: '#FEE2E2' }}>
                        <div>
                          <b>{st?.name ?? '(học sinh đã xoá)'}</b> — {n.periodLabel} — {fmtVnd(n.finalAmount)}
                          {n.adjustmentReason && <span style={{ color: C.muted }}> ({n.adjustmentReason})</span>}
                          <div style={{ color: C.muted }}>Đã gửi lúc {viDate(n.sentAt.slice(0, 10))} — chưa thu tiền</div>
                          {n.reportComment && <div className="mt-0.5" style={{ color: C.ink }}>📝 {n.reportComment}</div>}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Btn kind="solid" size="sm" onClick={() => markPaid(n)}>✅ Đã đóng tiền</Btn>
                          <button className="text-xs" style={{ color: C.muted }} onClick={() => undoSent(n)}>↩ Hoàn tác gửi</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {paid.length > 0 && (
              <Card className="p-4 space-y-2">
                <button
                  className="w-full text-left text-sm font-bold"
                  style={{ color: C.ink }}
                  onClick={() => setShowPaidHistory((x) => !x)}
                >
                  {showPaidHistory ? '▾' : '▸'} Đã đóng xong ({paid.length})
                </button>
                {showPaidHistory && (
                  <div className="space-y-1.5">
                    {paid.map((n) => {
                      const st = cls.students.find((s) => s.id === n.studentId)
                      return (
                        <div key={n._id} className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs" style={{ background: '#ECFDF5' }}>
                          <div>
                            <b>{st?.name ?? '(học sinh đã xoá)'}</b> — {n.periodLabel} — {fmtVnd(n.finalAmount)}
                            {n.adjustmentReason && <span style={{ color: C.muted }}> ({n.adjustmentReason})</span>}
                            <div style={{ color: C.muted }}>
                              Gửi {viDate(n.sentAt.slice(0, 10))} — đóng {n.paidAt ? viDate(n.paidAt.slice(0, 10)) : '?'}
                            </div>
                            {n.reportComment && <div className="mt-0.5" style={{ color: C.ink }}>📝 {n.reportComment}</div>}
                          </div>
                          <button className="shrink-0 text-xs" style={{ color: C.muted }} onClick={() => undoPaid(n)}>↩ Hoàn tác đóng</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}
          </>
        )
      })()}
    </div>
  )
}
