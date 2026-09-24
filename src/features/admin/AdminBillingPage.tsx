import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/services/admin'
import { classService } from '@/services/classes'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`

function todayMonth() {
  return new Date().toISOString().slice(0, 7)
}

/** 1 dòng nhập đơn giá cho 1 lớp — bản nháp tách khỏi giá trị đã lưu, chỉ
 *  gửi lên server khi bấm "Lưu" (tránh gọi API liên tục lúc đang gõ số). */
function ClassRateRow({
  row, onSaved,
}: {
  row: { classId: string; className: string; tuitionPerSession: number | null; teacherPayPerSession: number | null }
  onSaved: () => void
}) {
  const [tuition, setTuition] = useState(String(row.tuitionPerSession ?? ''))
  const [teacherPay, setTeacherPay] = useState(String(row.teacherPayPerSession ?? ''))
  const [saving, setSaving] = useState(false)
  const dirty = tuition !== String(row.tuitionPerSession ?? '') || teacherPay !== String(row.teacherPayPerSession ?? '')

  async function save() {
    setSaving(true)
    try {
      await classService.update(row.classId, {
        tuitionPerSession: tuition.trim() === '' ? undefined : Number(tuition),
        teacherPayPerSession: teacherPay.trim() === '' ? undefined : Number(teacherPay),
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
      <td className="py-2 px-3 font-semibold">{row.className}</td>
      <td className="py-2 px-3">
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
      <td className="py-2 px-3">
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
      </td>
      <td className="py-2 px-3 text-right">
        <Btn kind={dirty ? 'gold' : 'ghost'} disabled={!dirty || saving} onClick={save}>
          {saving ? 'Đang lưu...' : 'Lưu'}
        </Btn>
      </td>
    </tr>
  )
}

export function AdminBillingPage() {
  const [month, setMonth] = useState(todayMonth())
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'billing', month],
    queryFn: () => adminService.getBillingReport(month),
  })

  const refetch = () => qc.invalidateQueries({ queryKey: ['admin', 'billing', month] })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.board }}>Học phí & Lương</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Học phí = đơn giá/buổi × số buổi học sinh đã học trong tháng. Lương giáo viên = đơn giá/buổi × số buổi đã dạy
          trong tháng (cố định, không tính theo sĩ số). Đơn giá đặt riêng cho từng lớp.
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
                      <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Lương GV/buổi</th>
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
                      {t.byClass.map((c) => (
                        <div key={c.classId} className="flex items-center justify-between text-xs" style={{ color: C.muted }}>
                          <span>{c.className} · {c.sessionsCount} buổi × {fmtVnd(c.ratePerSession)}</span>
                          <span className="tabular-nums font-semibold" style={{ color: C.ink }}>{fmtVnd(c.total)}</span>
                        </div>
                      ))}
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
