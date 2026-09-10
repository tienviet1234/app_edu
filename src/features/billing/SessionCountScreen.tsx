import { useMemo, useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
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
  studentId: string
  studentName: string
  teacherName: string
  attendance: AttendanceKey
}

const ATTEND_STYLE: Record<AttendanceKey, { label: string; bg: string; fg: string }> = {
  present: { label: 'Có mặt', bg: C.emerald + '18', fg: C.emerald },
  late: { label: 'Muộn', bg: C.gold + '28', fg: '#7A5A05' },
  excused: { label: 'Có phép', bg: C.blue + '18', fg: C.blue },
  absent: { label: 'Vắng', bg: C.rose + '18', fg: C.rose },
}

export function SessionCountScreen({ cls }: SessionCountScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"
  const [studentFilter, setStudentFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { byDate, byStudent, byTeacher, totalRows } = useMemo(() => {
    const all: DetailRow[] = []
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          all.push({
            no: s.no,
            date: s.date,
            recordedAt: s.recordedAt,
            studentId: st.id,
            studentName: st.name,
            teacherName: s.createdByName ?? 'Chưa rõ giáo viên',
            attendance: s.entry.attendance,
          })
        })
    })

    const studentCount = new Map<string, number>()
    const teacherCount = new Map<string, number>()
    all.forEach((r) => {
      studentCount.set(r.studentName, (studentCount.get(r.studentName) ?? 0) + 1)
      teacherCount.set(r.teacherName, (teacherCount.get(r.teacherName) ?? 0) + 1)
    })

    const q = search.trim().toLowerCase()
    const filtered = all.filter(
      (r) =>
        (studentFilter === 'all' || r.studentId === studentFilter) &&
        (!q || r.studentName.toLowerCase().includes(q)),
    )

    const groups = new Map<string, DetailRow[]>()
    filtered.forEach((r) => {
      const list = groups.get(r.date) ?? []
      list.push(r)
      groups.set(r.date, list)
    })
    groups.forEach((list) => list.sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '')))
    const dateGroups = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])) // ngày gần nhất lên đầu

    return {
      byDate: dateGroups,
      byStudent: [...studentCount.entries()].sort((a, b) => b[1] - a[1]),
      byTeacher: [...teacherCount.entries()].sort((a, b) => b[1] - a[1]),
      totalRows: filtered.length,
    }
  }, [cls, month, studentFilter, search])

  function toggleDate(d: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

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
          <select
            value={studentFilter}
            onChange={(x) => setStudentFilter(x.target.value)}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            <option value="all">Tất cả học sinh</option>
            {cls.students.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(x) => setSearch(x.target.value)}
            placeholder="🔍 Tìm theo tên học sinh"
            className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
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
          <div className="text-xs opacity-80">{month} · {totalRows} buổi</div>
          <div className="text-lg font-bold">Chi tiết từng buổi</div>
        </div>
        {byDate.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Không có buổi nào khớp với bộ lọc.</div>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            {byDate.map(([date, dateRows]) => {
              const isCollapsed = collapsed.has(date)
              return (
                <div key={date} style={{ borderTop: `1px solid ${C.line}` }}>
                  <button
                    onClick={() => toggleDate(date)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left"
                    style={{ background: C.paper }}
                  >
                    <span className="text-sm font-bold" style={{ color: C.ink }}>
                      {isCollapsed ? '▸' : '▾'} {viDate(date)}
                    </span>
                    <span className="text-xs" style={{ color: C.muted }}>{dateRows.length} buổi</span>
                  </button>
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {dateRows.map((r, i) => {
                            const st = ATTEND_STYLE[r.attendance]
                            return (
                              <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                                <td className="py-2 pl-6 pr-3 font-bold" style={{ width: 56 }}>B{r.no}</td>
                                <td className="py-2 px-3" style={{ width: 90, color: r.recordedAt ? C.ink : C.muted }}>
                                  {r.recordedAt ? viDateTime(r.recordedAt).split(' ')[1] : '—'}
                                </td>
                                <td className="py-2 px-3">{r.studentName}</td>
                                <td className="py-2 px-3">
                                  <span
                                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                                    style={{ background: st.bg, color: st.fg }}
                                  >
                                    {st.label}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right" style={{ color: C.muted }}>{r.teacherName}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
