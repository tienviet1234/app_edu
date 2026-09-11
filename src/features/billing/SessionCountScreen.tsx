import { useMemo, useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO, viDate, viDateTime } from '@/utils/format'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { uid } from '@/utils/uid'
import { emptyEntry } from '@/business/seed'
import { isMongoid } from '@/utils/mongoid'
import { sessionService } from '@/services/sessions'
import { toast } from '@/store/toastStore'

interface SessionCountScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
  /** Nhảy sang màn Nhập điểm, mở đúng học sinh + buổi này để sửa điểm chi
   *  tiết (giáo viên/admin đều dùng được, không phân quyền riêng). */
  onEditInEntry: (studentId: string, no: number) => void
}

interface DetailRow {
  sessionId: string
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

export function SessionCountScreen({ cls, update, onEditInEntry }: SessionCountScreenProps) {
  const [month, setMonth] = useState(todayISO().slice(0, 7)) // "YYYY-MM"
  const [studentFilter, setStudentFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [addStudentId, setAddStudentId] = useState(cls.students[0]?.id ?? '')
  const [addNo, setAddNo] = useState(1)
  const [addDate, setAddDate] = useState(todayISO())

  const { byDate, byStudent, byTeacher, totalRows } = useMemo(() => {
    const all: DetailRow[] = []
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          all.push({
            sessionId: s.id,
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
    // Buổi của giáo viên = số NGÀY khác nhau giáo viên đó có điểm danh học
    // sinh — không đếm theo từng học sinh (1 ngày dạy 8 em vẫn tính 1 buổi).
    const teacherDates = new Map<string, Set<string>>()
    all.forEach((r) => {
      studentCount.set(r.studentName, (studentCount.get(r.studentName) ?? 0) + 1)
      const dates = teacherDates.get(r.teacherName) ?? new Set<string>()
      dates.add(r.date)
      teacherDates.set(r.teacherName, dates)
    })
    const teacherCount = new Map([...teacherDates.entries()].map(([name, dates]) => [name, dates.size]))

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

  function handleDateChange(row: DetailRow, newDate: string) {
    update((c) => {
      const s = c.students.find((y) => y.id === row.studentId)
      const ss = s?.sessions.find((y) => y.id === row.sessionId)
      if (ss) ss.date = newDate
    })
    if (isMongoid(row.sessionId)) {
      sessionService
        .update(row.sessionId, { scheduledAt: `${newDate}T00:00:00.000Z` })
        .catch(() => toast.error(`Lỗi khi lưu ngày mới của Buổi ${row.no} (${row.studentName}) lên server`, { persist: true }))
    }
  }

  async function handleDeleteRow(row: DetailRow) {
    if (!confirm(`Xóa Buổi ${row.no} (${viDate(row.date)}) của ${row.studentName}? Điểm buổi này sẽ mất.`)) return
    if (isMongoid(row.sessionId)) {
      try {
        await sessionService.remove(row.sessionId)
      } catch {
        toast.error(`Lỗi khi xóa Buổi ${row.no} trên server. Thử lại.`, { persist: true })
        return
      }
    }
    toast.success(`Đã xóa Buổi ${row.no} của ${row.studentName}`)
    update((c) => {
      const s = c.students.find((y) => y.id === row.studentId)
      if (!s) return
      s.sessions = s.sessions.filter((y) => y.id !== row.sessionId)
      s.sessions.forEach((y, idx) => { y.no = idx + 1 })
    })
  }

  async function handleAddSession() {
    const student = cls.students.find((s) => s.id === addStudentId)
    if (!student) return
    if (student.sessions.some((s) => s.no === addNo)) {
      toast.error(`${student.name} đã có sẵn Buổi ${addNo} rồi — chọn số buổi khác.`)
      return
    }
    const localId = uid()
    update((c) => {
      const s = c.students.find((y) => y.id === addStudentId)
      if (!s) return
      s.sessions.push({ id: localId, no: addNo, date: addDate, homework: '', entry: emptyEntry() })
      s.sessions.sort((a, b) => a.no - b.no)
    })
    if (isMongoid(cls.id) && isMongoid(addStudentId)) {
      try {
        const apiSession = await sessionService.create({
          classId: cls.id, studentId: addStudentId, title: `Buổi ${addNo}`,
          lessonNo: addNo, scheduledAt: `${addDate}T00:00:00.000Z`,
        })
        update((c) => {
          const s = c.students.find((y) => y.id === addStudentId)
          const ss = s?.sessions.find((y) => y.id === localId)
          if (ss) ss.id = apiSession._id
        })
      } catch {
        toast.error(`Đã tạo Buổi ${addNo} cho ${student.name} trên máy, nhưng lỗi khi lưu lên server. Thử lại.`, { persist: true })
      }
    }
    toast.success(`Đã thêm Buổi ${addNo} cho ${student.name} (${viDate(addDate)})`)
    setShowAdd(false)
    setAddNo(1)
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
          <Btn kind="solid" onClick={() => setShowAdd((v) => !v)}>+ Thêm buổi</Btn>
        </div>

        {showAdd && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl p-3" style={{ background: C.paper }}>
            <label className="text-xs">
              <div style={{ color: C.muted }}>Học sinh</div>
              <select
                value={addStudentId}
                onChange={(x) => setAddStudentId(x.target.value)}
                className="mt-1 rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              >
                {cls.students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <div style={{ color: C.muted }}>Buổi số</div>
              <input
                type="number" min="1"
                value={addNo}
                onChange={(x) => setAddNo(Math.max(1, Number(x.target.value)))}
                className="mt-1 w-20 rounded-lg px-2 py-1.5 text-center text-sm font-bold"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-xs">
              <div style={{ color: C.muted }}>Ngày</div>
              <input
                type="date"
                value={addDate}
                onChange={(x) => setAddDate(x.target.value)}
                className="mt-1 rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <Btn kind="solid" onClick={handleAddSession} disabled={!addStudentId}>Thêm</Btn>
            <Btn kind="ghost" onClick={() => setShowAdd(false)}>Hủy</Btn>
          </div>
        )}
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
                                <td className="py-2 px-2" style={{ width: 132 }}>
                                  <input
                                    type="date"
                                    value={r.date}
                                    onChange={(x) => handleDateChange(r, x.target.value)}
                                    className="w-full rounded-lg px-1.5 py-1 text-xs"
                                    style={{ border: `1px solid ${C.line}` }}
                                  />
                                </td>
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
                                <td className="py-2 px-3" style={{ color: C.muted }}>{r.teacherName}</td>
                                <td className="py-2 px-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => onEditInEntry(r.studentId, r.no)}
                                      className="rounded-lg px-2 py-1 text-xs font-bold"
                                      style={{ color: C.board }}
                                      title="Sửa điểm buổi này"
                                    >
                                      ✏️ Sửa
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteRow(r)}
                                      className="rounded-lg px-2 py-1 text-xs font-bold"
                                      style={{ color: C.red }}
                                    >
                                      Xóa
                                    </button>
                                  </div>
                                </td>
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
