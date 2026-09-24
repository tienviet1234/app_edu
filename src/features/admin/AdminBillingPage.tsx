import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type TeacherPayMode } from '@/services/admin'
import { classService } from '@/services/classes'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { viDate } from '@/utils/format'

const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`

function todayMonth() {
  return new Date().toISOString().slice(0, 7)
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

export function AdminBillingPage() {
  const [month, setMonth] = useState(todayMonth())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'billing', month],
    queryFn: () => adminService.getBillingReport(month),
  })

  const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'billing', month] })

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Học phí & Lương</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Học phí = đơn giá/buổi × số buổi học sinh đã học trong tháng. Lương giáo viên chọn 1 trong 2 cách theo từng lớp:
          đơn giá cố định/buổi, hoặc đơn giá/học-sinh-có-mặt/buổi (buổi đông lương cao hơn, buổi vắng nhiều lương thấp hơn).
        </p>
      </div>

      <Card className="p-3 flex items-center gap-2">
        <span className="text-sm font-medium" style={{ color: C.muted }}>Tháng:</span>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ border: `1px solid ${C.line}` }}
        />
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
                <div className="text-lg font-bold">Học phí học sinh — {month}</div>
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

          {/* Lương giáo viên */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold">Lương giáo viên — {month}</div>
                <div className="text-lg font-black tabular-nums">{fmtVnd(data.teachersTotal)}</div>
              </div>
            </div>
            {data.teachers.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi nào trong tháng này.</div>
            ) : (
              <div className="divide-y" style={{ borderColor: C.line }}>
                {data.teachers.map((t) => (
                  <div key={t.teacherId} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm" style={{ color: C.ink }}>{t.teacherName}</div>
                      <div className="font-black tabular-nums" style={{ color: C.board2 }}>{fmtVnd(t.total)}</div>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {t.byClass.map((c) => {
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
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
