import { useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO, viDate, viDateTime } from '@/utils/format'
import { Card } from '@/components/atoms/Card'

interface SessionCountScreenProps {
  cls: ClassData
}

interface DetailRow {
  no: number
  date: string
  recordedAt?: string
  studentName: string
  teacherName: string
}

export function SessionCountScreen({ cls }: SessionCountScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"

  const { rows, byStudent, byTeacher } = useMemo(() => {
    const all: DetailRow[] = []
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          all.push({
            no: s.no,
            date: s.date,
            recordedAt: s.recordedAt,
            studentName: st.name,
            teacherName: s.createdByName ?? 'Chưa rõ giáo viên',
          })
        })
    })
    all.sort((a, b) => (a.recordedAt ?? a.date).localeCompare(b.recordedAt ?? b.date))

    const studentCount = new Map<string, number>()
    const teacherCount = new Map<string, number>()
    all.forEach((r) => {
      studentCount.set(r.studentName, (studentCount.get(r.studentName) ?? 0) + 1)
      teacherCount.set(r.teacherName, (teacherCount.get(r.teacherName) ?? 0) + 1)
    })

    return {
      rows: all,
      byStudent: [...studentCount.entries()].sort((a, b) => b[1] - a[1]),
      byTeacher: [...teacherCount.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [cls, month])

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

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-3">
          <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>Tổng theo học sinh</div>
          <div className="flex flex-wrap gap-1.5">
            {byStudent.length === 0 && <span className="text-sm" style={{ color: C.muted }}>Chưa có buổi nào.</span>}
            {byStudent.map(([name, n]) => (
              <span key={name} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                {name}: <b style={{ color: C.board2 }}>{n}</b>
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-3">
          <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>Tổng theo giáo viên</div>
          <div className="flex flex-wrap gap-1.5">
            {byTeacher.length === 0 && <span className="text-sm" style={{ color: C.muted }}>Chưa có buổi nào.</span>}
            {byTeacher.map(([name, n]) => (
              <span key={name} className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                {name}: <b style={{ color: C.board2 }}>{n}</b>
              </span>
            ))}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
          <div className="text-xs opacity-80">{month}</div>
          <div className="text-lg font-bold">Chi tiết từng buổi</div>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học nào trong tháng này.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.paper }}>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Buổi</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Giờ ghi nhận</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Học sinh</th>
                  <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Giáo viên</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2 px-3 font-bold">B{r.no}</td>
                    <td className="py-2 px-3 font-semibold">{viDate(r.date)}</td>
                    <td className="py-2 px-3" style={{ color: r.recordedAt ? C.ink : C.muted }}>
                      {r.recordedAt ? viDateTime(r.recordedAt).split(' ')[1] : 'chưa rõ (buổi cũ)'}
                    </td>
                    <td className="py-2 px-3">{r.studentName}</td>
                    <td className="py-2 px-3">{r.teacherName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
