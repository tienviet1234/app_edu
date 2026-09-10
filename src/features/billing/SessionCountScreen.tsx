import { useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO } from '@/utils/format'
import { Card } from '@/components/atoms/Card'

interface SessionCountScreenProps {
  cls: ClassData
}

export function SessionCountScreen({ cls }: SessionCountScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"

  const { byStudent, byTeacher } = useMemo(() => {
    const studentRows = cls.students
      .map((st) => ({ name: st.name, count: st.sessions.filter((s) => s.date.startsWith(month)).length }))
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
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

    return { byStudent: studentRows, byTeacher: teacherRows }
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
        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">{month}</div>
            <div className="text-lg font-bold">Số buổi mỗi học sinh đã học</div>
          </div>
          {byStudent.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học nào trong tháng này.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {byStudent.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name}</span>
                  <span className="font-bold tabular-nums" style={{ color: C.board2 }}>{r.count} buổi</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
            <div className="text-xs opacity-80">{month}</div>
            <div className="text-lg font-bold">Số buổi mỗi giáo viên đã dạy</div>
          </div>
          {byTeacher.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có buổi học nào trong tháng này.</div>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {byTeacher.map((r) => (
                <div key={r.name} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{r.name}</span>
                  <span className="font-bold tabular-nums" style={{ color: C.board2 }}>{r.count} buổi</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
