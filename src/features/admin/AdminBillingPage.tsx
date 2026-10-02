import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type TeacherPayMode } from '@/services/admin'
import { classService } from '@/services/classes'
import { teacherPayService } from '@/services/teacherPay'
import { sessionMigrationService, type ClassMigrationSummary, type RunMigrationResult } from '@/services/sessionMigration'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { viDate } from '@/utils/format'

const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`

// yyyy-mm-dd từ ĐÚNG năm/tháng/ngày LOCAL — không qua toISOString() (đổi
// sang UTC dễ lùi/lên 1 ngày với giờ Việt Nam UTC+7, đúng kiểu lệch ngày
// admin đang gặp phải).
function fmtDate(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Gợi ý mặc định = tháng dương lịch hiện tại — chỉ là điểm bắt đầu tiện
 *  dùng, admin chỉnh "Từ ngày"/"Đến ngày" tự do để khớp đúng chu kỳ trả
 *  lương thật (không còn ép cứng theo tháng — xem ghi chú ở
 *  analyticsController.getBillingReport). */
function defaultRange() {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return {
    from: fmtDate(now.getFullYear(), now.getMonth(), 1),
    to: fmtDate(now.getFullYear(), now.getMonth(), lastDay),
  }
}

/** 1 dòng nhập đơn giá cho 1 lớp — bản nháp tách khỏi giá trị đã lưu, chỉ
 *  gửi lên server khi bấm "Lưu" (tránh gọi API liên tục lúc đang gõ số). */
function ClassRateRow({
  row, onSaved,
}: {
  row: {
    classId: string; className: string; tuitionPerSession: number | null
    teacherPayMode: TeacherPayMode; teacherPayPerSession: number | null; teacherPayPerStudentSession: number | null
  }
  onSaved: () => void
}) {
  const [tuition, setTuition] = useState(String(row.tuitionPerSession ?? ''))
  const [mode, setMode] = useState<TeacherPayMode>(row.teacherPayMode)
  const [teacherPay, setTeacherPay] = useState(String(row.teacherPayPerSession ?? ''))
  const [teacherPayPerStudent, setTeacherPayPerStudent] = useState(String(row.teacherPayPerStudentSession ?? ''))
  const [saving, setSaving] = useState(false)
  const dirty =
    tuition !== String(row.tuitionPerSession ?? '') ||
    mode !== row.teacherPayMode ||
    teacherPay !== String(row.teacherPayPerSession ?? '') ||
    teacherPayPerStudent !== String(row.teacherPayPerStudentSession ?? '')

  async function save() {
    setSaving(true)
    try {
      await classService.update(row.classId, {
        tuitionPerSession: tuition.trim() === '' ? undefined : Number(tuition),
        teacherPayMode: mode,
        teacherPayPerSession: mode === 'fixed' && teacherPay.trim() !== '' ? Number(teacherPay) : undefined,
        teacherPayPerStudentSession: mode === 'perStudent' && teacherPayPerStudent.trim() !== '' ? Number(teacherPayPerStudent) : undefined,
      })
      toast.success(`Đã lưu đơn giá cho ${row.className}`)
      onSaved()
    } catch {
      toast.error(`Lỗi khi lưu đơn giá cho ${row.className}. Thử lại.`, { persist: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr style={{ borderTop: `1px solid ${C.line}` }}>
      <td className="py-2 px-3 font-semibold align-top">{row.className}</td>
      <td className="py-2 px-3 align-top">
        <div className="flex items-center gap-1">
          <input
            type="text" inputMode="numeric"
            value={tuition}
            onChange={(e) => setTuition(e.target.value.replace(/\D/g, ''))}
            placeholder="VD 150000"
            className="w-28 rounded-lg px-2 py-1 text-right text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span className="text-xs" style={{ color: C.muted }}>đ/buổi</span>
        </div>
      </td>
      <td className="py-2 px-3 align-top">
        <div className="space-y-1.5">
          <div className="flex gap-1">
            {(['fixed', 'perStudent'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: mode === m ? C.board : C.paper,
                  color: mode === m ? '#fff' : C.muted,
                  border: `1px solid ${mode === m ? C.board : C.line}`,
                }}
              >
                {m === 'fixed' ? 'Cố định/buổi' : 'Theo học sinh'}
              </button>
            ))}
          </div>
          {mode === 'fixed' ? (
            <div className="flex items-center gap-1">
              <input
                type="text" inputMode="numeric"
                value={teacherPay}
                onChange={(e) => setTeacherPay(e.target.value.replace(/\D/g, ''))}
                placeholder="VD 200000"
                className="w-28 rounded-lg px-2 py-1 text-right text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <span className="text-xs" style={{ color: C.muted }}>đ/buổi</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="text" inputMode="numeric"
                value={teacherPayPerStudent}
                onChange={(e) => setTeacherPayPerStudent(e.target.value.replace(/\D/g, ''))}
                placeholder="VD 25000"
                className="w-28 rounded-lg px-2 py-1 text-right text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <span className="text-xs" style={{ color: C.muted }}>đ/học sinh/buổi</span>
            </div>
          )}
        </div>
      </td>
      <td className="py-2 px-3 text-right align-top">
        <Btn kind={dirty ? 'gold' : 'ghost'} disabled={!dirty || saving} onClick={save}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Btn>
      </td>
    </tr>
  )
}

const ATTEND_SHORT: Record<string, string> = { present: 'Có mặt', late: 'Muộn', excused: 'Phép', absent: 'Vắng' }

/** Bảng đối chiếu chi tiết từng ngày đã dạy của 1 lớp — sĩ số, có mặt/vắng,
 *  tên học sinh vắng — để admin so lại với giáo viên khi có thắc mắc về lương. */
function TeacherDayDetail({ days }: { days: { date: string; totalStudents: number; attendedStudents: number; present: number; late: number; excused: number; absent: number; absentNames: string[] }[] }) {
  return (
    <div className="mt-1.5 overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.line}` }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: C.paper }}>
            <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
            <th className="py-1.5 px-2 text-right font-semibold" style={{ color: C.muted }}>Sĩ số</th>
            <th className="py-1.5 px-2 text-right font-semibold" style={{ color: C.muted }}>Có mặt</th>
            <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Vắng/Muộn/Phép</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} style={{ borderTop: `1px solid ${C.line}` }}>
              <td className="py-1.5 px-2 font-semibold">{viDate(d.date)}</td>
              <td className="py-1.5 px-2 text-right tabular-nums">{d.totalStudents}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: C.emerald }}>
                {d.attendedStudents}
              </td>
              <td className="py-1.5 px-2" style={{ color: C.muted }}>
                {d.late ? `${d.late} ${ATTEND_SHORT.late.toLowerCase()}` : ''}
                {d.excused ? `${d.late ? ' · ' : ''}${d.excused} ${ATTEND_SHORT.excused.toLowerCase()}` : ''}
                {d.absent ? `${d.late || d.excused ? ' · ' : ''}${d.absent} vắng: ${d.absentNames.join(', ')}` : ''}
                {!d.late && !d.excused && !d.absent ? 'Đầy đủ' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Lương của ĐÚNG 1 giáo viên, với bộ chọn ngày RIÊNG của giáo viên đó — mỗi
 *  cô có thể có chu kỳ trả lương khác nhau (không dùng chung 1 khoảng ngày
 *  cho tất cả), nên mỗi thẻ tự quản lý from/to + tự gọi báo cáo riêng (truyền
 *  teacherId để backend chỉ tính đúng lớp của cô đó). */
function TeacherSalaryCard({ teacher }: { teacher: { _id: string; name: string } }) {
  const [{ from, to }, setRange] = useState(defaultRange())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'billing', 'teacher', teacher._id, from, to],
    queryFn: () => adminService.getBillingReport(from, to, teacher._id),
    enabled: from <= to,
  })

  const { data: payRecords, refetch: refetchPay } = useQuery({
    queryKey: ['teacher-pay', from, to],
    queryFn: () => teacherPayService.list(from, to),
    enabled: from <= to,
  })

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const row = data?.teachers.find((t) => t.teacherId === teacher._id)

  return (
    <div className="p-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-bold text-sm" style={{ color: C.ink }}>{teacher.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <input
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-lg px-2 py-1"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span style={{ color: C.muted }}>–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg px-2 py-1"
            style={{ border: `1px solid ${C.line}` }}
          />
          <button className="font-semibold" style={{ color: C.board2 }} onClick={() => setRange(defaultRange())}>
            Tháng này
          </button>
        </div>
      </div>

      {from > to && <div className="mt-1 text-xs" style={{ color: C.red }}>"Từ ngày" phải trước "Đến ngày".</div>}
      {isLoading && <div className="mt-1 text-xs" style={{ color: C.muted }}>Đang tải...</div>}
      {isError && <div className="mt-1 text-xs" style={{ color: C.red }}>Lỗi khi tải — thử lại.</div>}

      {data && !row && (
        <div className="mt-1 text-xs" style={{ color: C.muted }}>Không có buổi nào trong khoảng ngày này.</div>
      )}

      {row && (
        <>
          <div className="mt-1.5 flex items-center justify-between">
            <TeacherPayAction
              teacherId={teacher._id}
              teacherName={teacher.name}
              from={from}
              to={to}
              suggestedAmount={row.total}
              record={payRecords?.find((r) => r.teacherId === teacher._id)}
              onChanged={refetchPay}
            />
            <div className="font-black tabular-nums" style={{ color: C.board2 }}>{fmtVnd(row.total)}</div>
          </div>
          <div className="mt-1.5 space-y-1">
            {row.byClass.map((c) => {
              const key = `${c.classId}:${c.teacherId}`
              const isOpen = expanded.has(key)
              return (
                <div key={key}>
                  <button
                    onClick={() => toggleExpand(key)}
                    className="flex w-full items-center justify-between text-xs text-left"
                    style={{ color: C.muted }}
                  >
                    <span>
                      {isOpen ? '▾' : '▸'} {c.className} · {c.sessionsCount} buổi ·{' '}
                      {c.payMode === 'perStudent'
                        ? `${fmtVnd(c.ratePerStudentSession)}/học sinh có mặt`
                        : `${fmtVnd(c.ratePerSession)}/buổi`}
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: C.ink }}>{fmtVnd(c.total)}</span>
                  </button>
                  {isOpen && <TeacherDayDetail days={c.days} />}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/** "Đã trả lương" hay chưa cho 1 giáo viên trong đúng khoảng [from,to] đang
 *  xem — giống hệt kiểu "đã đóng học phí" của TuitionNotice: tạo record MỚI
 *  khi xác nhận (không có bước nháp riêng), xoá record khi lỡ bấm nhầm (ghi
 *  nhầm thì xoá rồi đánh dấu lại, không có hàm "sửa"). */
function TeacherPayAction({
  teacherId, teacherName, from, to, suggestedAmount, record, onChanged,
}: {
  teacherId: string; teacherName: string; from: string; to: string; suggestedAmount: number
  record: { _id: string; amount: number; paidAt: string } | undefined
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function confirmPaid() {
    setSaving(true)
    try {
      await teacherPayService.markPaid({ teacherId, from, to, amount: suggestedAmount })
      toast.success(`Đã đánh dấu trả lương cho ${teacherName}.`)
      onChanged()
    } catch {
      toast.error('Lỗi — thử lại.')
    } finally {
      setSaving(false)
    }
  }

  async function undo() {
    if (!record) return
    setSaving(true)
    try {
      await teacherPayService.remove(record._id)
      toast.success('Đã hoàn tác.')
      onChanged()
    } catch {
      toast.error('Lỗi — thử lại.')
    } finally {
      setSaving(false)
    }
  }

  if (record) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold" style={{ color: C.emerald }}>
          ✅ Đã trả lương {viDate(record.paidAt.slice(0, 10))}
        </span>
        <button disabled={saving} className="shrink-0" style={{ color: C.muted }} onClick={undo}>
          ↩ Hoàn tác
        </button>
      </div>
    )
  }
  return (
    <Btn kind="solid" size="sm" disabled={saving} onClick={confirmPaid}>
      {saving ? 'Đang lưu...' : '✅ Đánh dấu đã trả lương'}
    </Btn>
  )
}

const CONFIRM_PHRASE = 'CHAY THAT'

/** Công cụ 1 lần: dữ liệu buổi học ghi TRƯỚC khi app chuyển sang "mỗi học
 *  sinh có buổi học riêng" (10/9) vẫn nằm ở dạng "buổi chung" cũ — phần tính
 *  học phí/lương chỉ đọc buổi đã gắn đúng học sinh nên bỏ sót hết dữ liệu cũ
 *  (hiện số buổi rất thấp dù thực tế đã chấm rất chi tiết). Migration này
 *  chuyển dữ liệu cũ sang đúng cấu trúc mới — KHÔNG xóa gì, chỉ thêm bản ghi
 *  mới + đánh dấu bản cũ đã chuyển. Chạy 1 LẦN DUY NHẤT cho cả hệ thống. */
function SessionMigrationTool() {
  const [open, setOpen] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ClassMigrationSummary[] | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunMigrationResult | null>(null)

  const pendingTotal = preview?.reduce((a, s) => a + s.sharedSessionsFound, 0) ?? 0

  async function doPreview() {
    setPreviewing(true)
    try {
      const { summaries } = await sessionMigrationService.preview()
      setPreview(summaries)
      if (!summaries.length) toast.info('Không có buổi học cũ nào cần chuyển — dữ liệu đã đầy đủ.')
    } catch {
      toast.error('Lỗi khi xem trước — thử lại.')
    } finally {
      setPreviewing(false)
    }
  }

  async function doRun() {
    setRunning(true)
    try {
      const res = await sessionMigrationService.run()
      setResult(res)
      if (res.alreadyRan) {
        toast.info('Migration này đã chạy trước đó rồi — không chạy lại.')
      } else {
        toast.success('Đã chuyển xong dữ liệu buổi học cũ sang cấu trúc mới.')
        setPreview(null)
        setConfirmText('')
      }
    } catch {
      toast.error('Lỗi khi chạy migration — KHÔNG thử lại ngay, báo cho người phụ trách kỹ thuật kiểm tra trước.', { persist: true })
    } finally {
      setRunning(false)
    }
  }

  function downloadBackup() {
    if (!result?.backup) return
    const blob = new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-truoc-migration-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="overflow-hidden" style={{ border: `1.5px solid ${C.gold}66` }}>
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ background: C.gold + '1a' }}
        onClick={() => setOpen((x) => !x)}
      >
        <div>
          <div className="text-sm font-bold" style={{ color: '#92400E' }}>
            ⚠ Chuyển dữ liệu buổi học cũ (chạy 1 lần)
          </div>
          <div className="text-xs" style={{ color: C.muted }}>
            Sửa gốc việc "Số buổi" hiện toàn 1 dù đã chấm chi tiết — bấm để xem thêm
          </div>
        </div>
        <span style={{ color: C.muted }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="space-y-3 p-4 text-sm">
          <p style={{ color: C.muted }}>
            Dữ liệu buổi học ghi TRƯỚC ngày app chuyển sang "mỗi học sinh có buổi riêng" vẫn nằm ở dạng cũ (buổi chung
            cả lớp) — nên phần tính học phí/lương phía trên bỏ sót, chỉ thấy đúng vài buổi mới gần đây. Công cụ này
            chuyển đúng dữ liệu cũ đó sang cấu trúc mới — <b>không xóa gì</b>, chỉ thêm bản ghi mới + đánh dấu bản cũ
            đã chuyển. Chỉ cần chạy <b>1 lần duy nhất</b>.
          </p>

          <Btn kind="ghost" size="sm" disabled={previewing} onClick={doPreview}>
            {previewing ? 'Đang xem...' : '1. Xem trước (an toàn, không ghi gì)'}
          </Btn>

          {preview && preview.length > 0 && (
            <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.line}` }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: C.paper }}>
                    <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Lớp</th>
                    <th className="py-1.5 px-2 text-right font-semibold" style={{ color: C.muted }}>Buổi chung cũ</th>
                    <th className="py-1.5 px-2 text-right font-semibold" style={{ color: C.muted }}>Sẽ tạo buổi riêng</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((s) => (
                    <tr key={s.classId} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-1.5 px-2 font-semibold">{s.className}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{s.sharedSessionsFound}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{s.newDocsCreated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview && pendingTotal > 0 && (
            <div className="space-y-2 rounded-lg p-3" style={{ background: '#FEF3C7' }}>
              <div className="text-xs font-semibold" style={{ color: '#92400E' }}>
                2. Xác nhận chạy thật — gõ đúng chữ "{CONFIRM_PHRASE}" vào ô dưới rồi bấm nút:
              </div>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                className="w-48 rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
              <div>
                <Btn
                  kind="solid"
                  size="sm"
                  disabled={confirmText.trim() !== CONFIRM_PHRASE || running}
                  onClick={doRun}
                >
                  {running ? 'Đang chạy...' : '✅ Chạy migration thật'}
                </Btn>
              </div>
            </div>
          )}

          {result && !result.alreadyRan && (
            <div className="space-y-2 rounded-lg p-3" style={{ background: '#ECFDF5' }}>
              <div className="text-xs font-semibold" style={{ color: '#065F46' }}>
                ✅ Đã chuyển xong {result.summaries.reduce((a, s) => a + s.newDocsCreated, 0)} buổi riêng từ{' '}
                {result.summaries.reduce((a, s) => a + s.sharedSessionsFound, 0)} buổi chung cũ. Quay lại bảng phía
                trên (chọn lại khoảng ngày) để thấy số buổi đầy đủ.
              </div>
              {result.backup && (
                <button className="text-xs underline" style={{ color: C.muted }} onClick={downloadBackup}>
                  ⬇ Tải về bản sao lưu dữ liệu trước khi chuyển (JSON)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export function AdminBillingPage() {
  const [{ from, to }, setRange] = useState(defaultRange())
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'billing', from, to],
    queryFn: () => adminService.getBillingReport(from, to),
    enabled: from <= to,
  })

  // Danh sách giáo viên — ĐỘC LẬP với from/to ở trên, vì mỗi cô xem lương
  // theo chu kỳ riêng của mình (xem TeacherSalaryCard), không dùng chung 1
  // khoảng ngày cho tất cả như trước.
  const { data: teachersData } = useQuery({
    queryKey: ['admin', 'users', 'teachers-list'],
    queryFn: () => adminService.listUsers({ role: 'teacher', limit: '100' }),
  })
  const teachers = teachersData?.items ?? []

  const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'billing', from, to] })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Học phí & Lương</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Học phí = đơn giá/buổi × số buổi học sinh đã học trong khoảng ngày đã chọn. Lương giáo viên chọn 1 trong 2
          cách theo từng lớp: đơn giá cố định/buổi, hoặc đơn giá/học-sinh-có-mặt/buổi (buổi đông lương cao hơn, buổi
          vắng nhiều lương thấp hơn). Mỗi giáo viên xem lương theo đúng chu kỳ riêng của mình ở khung "Lương giáo
          viên" phía dưới — không nhất thiết trùng ngày với bảng học phí học sinh.
        </p>
      </div>

      <SessionMigrationTool />

      <Card className="p-3 space-y-1.5">
        <div className="text-sm font-bold" style={{ color: C.ink }}>Khoảng ngày — Đơn giá & Học phí học sinh</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: C.muted }}>Từ ngày:</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span className="text-sm font-medium" style={{ color: C.muted }}>Đến ngày:</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          />
          <Btn kind="ghost" size="sm" onClick={() => setRange(defaultRange())}>Về tháng này</Btn>
        </div>
        {from > to && (
          <div className="text-xs" style={{ color: C.red }}>"Từ ngày" phải trước "Đến ngày".</div>
        )}
        <div className="text-xs" style={{ color: C.muted }}>
          Không bắt buộc đúng theo tháng dương lịch — chọn đúng khoảng ngày cần xem để buổi dạy liên tục không bị cắt
          ngang giữa 2 tháng. Riêng lương giáo viên có bộ chọn ngày RIÊNG ở khung bên dưới (xem ghi chú ở đó).
        </div>
      </Card>

      {isLoading && <Card className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</Card>}
      {isError && <Card className="p-6 text-center text-sm" style={{ color: C.red }}>Lỗi khi tải báo cáo. Thử lại.</Card>}

      {data && (
        <>
          {data.unassignedClasses.length > 0 && (
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{ background: C.rose + '14', border: `1px solid ${C.rose}44`, color: '#9F1239' }}
            >
              ⚠ {data.unassignedClasses.length} lớp có buổi học trong tháng nhưng <b>chưa gán giáo viên chính thức</b> —
              chưa tính được lương vì không rõ trả cho ai: {data.unassignedClasses.map((c) => c.className).join(', ')}.
              Vào tab <b>Lớp học</b> để gán giáo viên cho các lớp này.
            </div>
          )}

          {/* Đơn giá theo lớp */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <div className="text-lg font-bold">Đơn giá theo lớp</div>
              <div className="text-xs opacity-80">Để trống nếu chưa muốn tính tiền cho lớp đó</div>
            </div>
            {data.classes.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có lớp nào.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: C.paper }}>
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Lớp</th>
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Học phí/buổi</th>
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Lương giáo viên</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.classes.map((row) => (
                      <ClassRateRow key={row.classId} row={row} onSaved={refetch} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Học phí học sinh */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold">Học phí học sinh — {viDate(from)}–{viDate(to)}</div>
                <div className="text-lg font-black tabular-nums">{fmtVnd(data.studentsTotal)}</div>
              </div>
            </div>
            {data.students.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi nào trong tháng này.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: C.paper }}>
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Lớp</th>
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Học sinh</th>
                      <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Số buổi</th>
                      <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Đơn giá/buổi</th>
                      <th className="py-2 px-3 text-right font-semibold" style={{ color: C.muted }}>Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((row) => (
                      <tr key={`${row.classId}:${row.studentId}`} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td className="py-2 px-3" style={{ color: C.muted }}>{row.className}</td>
                        <td className="py-2 px-3 font-semibold">{row.studentName}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{row.sessionsCount}</td>
                        <td className="py-2 px-3 text-right tabular-nums" style={{ color: C.muted }}>
                          {row.ratePerSession ? fmtVnd(row.ratePerSession) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-bold tabular-nums">{fmtVnd(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Lương giáo viên — mỗi cô 1 bộ chọn ngày riêng, không dùng chung
              khoảng ngày ở trên (chu kỳ trả lương mỗi người có thể khác nhau). */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <div className="text-lg font-bold">Lương giáo viên</div>
              <div className="text-xs opacity-80">Mỗi giáo viên tự chọn khoảng ngày riêng theo đúng chu kỳ trả lương của cô đó</div>
            </div>
            {teachers.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có giáo viên nào.</div>
            ) : (
              teachers.map((t) => <TeacherSalaryCard key={t._id} teacher={t} />)
            )}
          </Card>
        </>
      )}
    </div>
  )
}
