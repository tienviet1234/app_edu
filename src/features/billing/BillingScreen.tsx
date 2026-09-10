import { useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO } from '@/utils/format'
import { Card } from '@/components/atoms/Card'

interface BillingScreenProps {
  cls: ClassData
}

const fmtVND = (n: number): string => n.toLocaleString('vi-VN') + 'đ'

export function BillingScreen({ cls }: BillingScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"

  const { byStudent, byTeacher, totalStudent, totalTeacher } = useMemo(() => {
    const studentRows = cls.students
      .map((st) => {
        const count = st.sessions.filter((s) => s.date.startsWith(month)).length
        return { name: st.name, count, amount: count * (cls.studentRate ?? 0) }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)

    const teacherMap = new Map<string, number>()
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          const name = s.createdByName ?? 'Chưa rõ giáo viên'
          teacherMap.set(name, (teacherMap.get(name) ?? 0) + 1)
        })
    })
    const teacherRows = [...teacherMap.entries()]
      .map(([name, count]) => ({ name, count, amount: count * (cls.teacherRate ?? 0) }))
      .sort((a, b) => b.count - a.count)

    return {
      byStudent: studentRows,
      byTeacher: teacherRows,
      totalStudent: studentRows.reduce((a, r) => a + r.amount, 0),
      totalTeacher: teacherRows.reduce((a, r) => a + r.amount, 0),
    }
  }, [cls, month])

  const missingRates = !cls.studentRate || !cls.teacherRate

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: C.muted }}>Tháng:</span>
          <input
            type="month"
            value={month}
            onChange={(x) => setMonth(x.target.value)}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          />
        </div>
      </Card>

      {missingRates && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: C.gold + '22', color: '#7A5A05', border: `1px solid ${C.gold}55` }}
        >
          ⚠ Lớp này chưa đặt {!cls.studentRate ? 'học phí/buổi' : ''}
          {!cls.studentRate && !cls.teacherRate ? ' và ' : ''}
          {!cls.teacherRate ? 'lương GV/buổi' : ''} — vào tab <b>Lớp học</b>, mục "THIẾT LẬP" để nhập, số tiền bên dưới sẽ hiện đúng.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">Học phí phụ huynh — {month}</div>
            <div className="text-lg font-bold">Theo học sinh</div>
          </div>
          {byStudent.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học nào trong tháng này.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {byStudent.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name}</span>
                  <span style={{ color: C.muted }}>{r.count} buổi</span>
                  <span className="font-bold tabular-nums">{fmtVND(r.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 text-sm font-bold" style={{ background: C.paper }}>
                <span>Tổng thu</span>
                <span className="tabular-nums" style={{ color: C.emerald }}>{fmtVND(totalStudent)}</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">Lương giáo viên — {month}</div>
            <div className="text-lg font-bold">Theo giáo viên</div>
          </div>
          {byTeacher.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học nào trong tháng này.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {byTeacher.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name}</span>
                  <span style={{ color: C.muted }}>{r.count} buổi</span>
                  <span className="font-bold tabular-nums">{fmtVND(r.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 text-sm font-bold" style={{ background: C.paper }}>
                <span>Tổng chi</span>
                <span className="tabular-nums" style={{ color: C.rose }}>{fmtVND(totalTeacher)}</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{ color: C.muted }}>CHÊNH LỆCH (thu − chi) THÁNG {month.split('-')[1]}</span>
          <span
            className="text-xl font-black tabular-nums"
            style={{ color: totalStudent - totalTeacher >= 0 ? C.emerald : C.rose }}
          >
            {fmtVND(totalStudent - totalTeacher)}
          </span>
        </div>
      </Card>
    </div>
  )
}
