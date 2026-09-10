import { useMemo, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO, viDate, viDateTime } from '@/utils/format'
import { Card } from '@/components/atoms/Card'

interface SessionCountScreenProps {
  cls: ClassData
}

interface DetailRow {
  date: string
  recordedAt?: string
}

export function SessionCountScreen({ cls }: SessionCountScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"
  const [openStudent, setOpenStudent] = useState<string | null>(null)
  const [openTeacher, setOpenTeacher] = useState<string | null>(null)

  const { byStudent, byTeacher } = useMemo(() => {
    const studentRows = cls.students
      .map((st) => ({
        name: st.name,
        details: st.sessions
          .filter((s) => s.date.startsWith(month))
          .map((s): DetailRow => ({ date: s.date, recordedAt: s.recordedAt }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .filter((r) => r.details.length > 0)
      .sort((a, b) => b.details.length - a.details.length)

    const teacherMap = new Map<string, Array<DetailRow & { studentName: string }>>()
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          const name = s.createdByName ?? 'Chưa rõ giáo viên'
          const list = teacherMap.get(name) ?? []
          list.push({ date: s.date, recordedAt: s.recordedAt, studentName: st.name })
          teacherMap.set(name, list)
        })
    })
    const teacherRows = [...teacherMap.entries()]
      .map(([name, details]) => ({
        name,
        details: details.sort((a, b) => a.date.localeCompare(b.date) || a.studentName.localeCompare(b.studentName)),
      }))
      .sort((a, b) => b.details.length - a.details.length)

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
              {byStudent.map((r) => {
                const isOpen = openStudent === r.name
                return (
                  <div key={r.name}>
                    <button
                      onClick={() => setOpenStudent(isOpen ? null : r.name)}
                      className="flex w-full items-center justify-between px-4 py-2 text-sm text-left"
                    >
                      <span>{isOpen ? '▾' : '▸'} {r.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: C.board2 }}>{r.details.length} buổi</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-2 space-y-1" style={{ background: C.paper }}>
                        {r.details.map((d, i) => (
                          <div key={i} className="flex items-center justify-between py-1 text-xs" style={{ color: C.muted }}>
                            <span>{i + 1}. {viDate(d.date)}</span>
                            <span>{d.recordedAt ? viDateTime(d.recordedAt) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
              {byTeacher.map((r) => {
                const isOpen = openTeacher === r.name
                return (
                  <div key={r.name}>
                    <button
                      onClick={() => setOpenTeacher(isOpen ? null : r.name)}
                      className="flex w-full items-center justify-between px-4 py-2 text-sm text-left"
                    >
                      <span>{isOpen ? '▾' : '▸'} {r.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: C.board2 }}>{r.details.length} buổi</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-2 space-y-1" style={{ background: C.paper }}>
                        {r.details.map((d, i) => (
                          <div key={i} className="flex items-center justify-between py-1 text-xs" style={{ color: C.muted }}>
                            <span>{i + 1}. {d.studentName} · {viDate(d.date)}</span>
                            <span>{d.recordedAt ? viDateTime(d.recordedAt) : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
