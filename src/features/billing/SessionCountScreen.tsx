import { useMemo, useRef, useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { todayISO, viDate, viDateTime } from '@/utils/format'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { emptyEntry } from '@/business/seed'
import { isMongoid } from '@/utils/mongoid'
import { sessionService } from '@/services/sessions'
import { toast } from '@/store/toastStore'
import { useAppStore } from '@/store/appStore'
import { appendOrphans, orphanForLocalDelete } from '@/business/sync'
import { dateChangeCheck } from '@/business/sessionDates'
import { removeSessionLocally, insertNoByDate } from '@/business/resequence'
import { sessionLabelOf, periodPositionOf } from '@/business/tuition'
import { makeRoomForServerNo } from '@/business/sync'
import { DateCommitInput } from '@/components/molecules/DateCommitInput'
import { logActivity } from '@/services/activity'

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
  /** `teacherName` có khớp đúng giáo viên CHÍNH THỨC của lớp (cls.teacher)
   *  không — false khi admin (hoặc người khác) tạo/sửa hộ bản ghi này. Dùng
   *  để KHÔNG tính nhầm người sửa hộ thành "đã dạy buổi đó" ở các khung tổng
   *  hợp theo giáo viên. */
  isOfficialTeacher: boolean
  attendance: AttendanceKey
  /** Em này có 2+ bản ghi buổi KHÁC NHAU trong CÙNG 1 ngày (dù số buổi khác
   *  nhau) — gần như chắc chắn là chấm trùng/chấm nhầm 2 lần, không phải do
   *  thiết kế. Khác với lỗi "lệch ngày" (cùng buổi, khác ngày) đã có công cụ
   *  riêng — ca này phải xem tay rồi tự xóa bớt 1 bản (không tự xóa giúp vì
   *  không chắc bản nào mới đúng). */
  isDuplicateDay: boolean
}

interface TeacherDay {
  date: string
  students: string[]
}

interface NoDateGroup {
  date: string
  /** Toàn bộ dòng chi tiết (kèm sessionId để Sửa/Xóa) của ngày này, trong
   *  nhóm buổi g.no — em nào buổi riêng khác g.no vẫn nằm ở đây (không tách
   *  dòng), chỉ đánh dấu khác màu ở cột Buổi. */
  rows: DetailRow[]
  /** Giáo viên chính thức của lớp đã ghi/chấm hôm đó. */
  teachers: string[]
  /** Người KHÁC (thường là admin) đã tạo/sửa hộ bản ghi hôm đó — không phải
   *  giáo viên dạy thật, chỉ hiện để minh bạch, không tính là "đã dạy". */
  editors: string[]
}

interface NoGroup {
  no: number
  dates: NoDateGroup[]
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
  const [teacherFilter, setTeacherFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null)
  const [expandedNos, setExpandedNos] = useState<Set<number>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [addStudentId, setAddStudentId] = useState(cls.students[0]?.id ?? '')
  const [adding, setAdding] = useState(false)
  const addingRef = useRef(false) // khóa ngay (2 cú bấm liền vẫn thấy `adding` cũ)
  const [addDate, setAddDate] = useState(todayISO())

  // Tháng gần nhất THỰC SỰ có buổi học — độc lập với `month` đang chọn. Dùng
  // để phân biệt "lớp này chưa từng học buổi nào" (trống thật) với "chỉ đang
  // xem nhầm tháng" (VD vừa sang tháng mới, `month` mặc định = hôm nay nhưng
  // dữ liệu còn nằm hết ở tháng trước) — tránh giáo viên tưởng mất dữ liệu.
  const latestMonthWithData = useMemo(() => {
    let latest = ''
    cls.students.forEach((st) => st.sessions.forEach((s) => {
      const m = s.date.slice(0, 7)
      if (m > latest) latest = m
    }))
    return latest || null
  }, [cls])

  const { byStudent, byTeacher, byNo, teacherNames, totalRows, duplicateCount } = useMemo(() => {
    const rawRows: Omit<DetailRow, 'isDuplicateDay'>[] = []
    cls.students.forEach((st) => {
      st.sessions
        .filter((s) => s.date.startsWith(month))
        .forEach((s) => {
          const teacherName = s.createdByName ?? 'Chưa rõ giáo viên'
          rawRows.push({
            sessionId: s.id,
            no: s.no,
            date: s.date,
            recordedAt: s.recordedAt,
            studentId: st.id,
            studentName: st.name,
            teacherName,
            isOfficialTeacher: teacherName === cls.teacher,
            attendance: s.entry.attendance,
          })
        })
    })

    // Em nào có 2+ bản ghi buổi trong CÙNG 1 ngày (bất kể số buổi) — gần như
    // chắc chắn chấm trùng 2 lần, đánh dấu để dễ phát hiện mà tự xóa bớt.
    const studentDateCount = new Map<string, number>()
    rawRows.forEach((r) => {
      const key = `${r.studentId}:${r.date}`
      studentDateCount.set(key, (studentDateCount.get(key) ?? 0) + 1)
    })
    const all: DetailRow[] = rawRows.map((r) => ({
      ...r,
      isDuplicateDay: (studentDateCount.get(`${r.studentId}:${r.date}`) ?? 0) > 1,
    }))

    // Buổi của học sinh = số NGÀY khác nhau em đó có bản ghi buổi — gộp lại
    // nếu có 2+ bản ghi cùng 1 ngày (VD do trước đây từng bị lỗi tách buổi
    // nhầm), tránh đếm dư ảnh hưởng học phí. Dùng studentId để tránh trùng
    // tên giữa 2 học sinh khác nhau.
    const studentDays = new Map<string, Set<string>>()
    const studentNameById = new Map<string, string>()
    // Buổi của giáo viên = số NGÀY khác nhau giáo viên đó có điểm danh học
    // sinh — không đếm theo từng học sinh (1 ngày dạy 8 em vẫn tính 1 buổi).
    // Kèm chi tiết từng buổi: ngày đó có những học sinh nào (bấm vào xem).
    const teacherDayStudents = new Map<string, Map<string, Set<string>>>()
    all.forEach((r) => {
      const days = studentDays.get(r.studentId) ?? new Set<string>()
      days.add(r.date)
      studentDays.set(r.studentId, days)
      studentNameById.set(r.studentId, r.studentName)

      // Chỉ tính vào "Tổng theo giáo viên" khi ĐÚNG là giáo viên chính thức
      // của lớp — người khác (thường admin) tạo/sửa hộ 1 buổi không phải là
      // "đã dạy buổi đó", không tính vào đây (xem NoDateGroup.editors để biết
      // ai đã sửa hộ, tách riêng).
      if (!r.isOfficialTeacher) return
      const byDay = teacherDayStudents.get(r.teacherName) ?? new Map<string, Set<string>>()
      const names = byDay.get(r.date) ?? new Set<string>()
      names.add(r.studentName)
      byDay.set(r.date, names)
      teacherDayStudents.set(r.teacherName, byDay)
    })
    const studentCount = new Map(
      [...studentDays.entries()].map(([sid, days]) => [studentNameById.get(sid)!, days.size] as const),
    )
    const teacherCount = new Map(
      [...teacherDayStudents.entries()].map(([name, byDay]) => {
        const allStudents = new Set<string>()
        byDay.forEach((names) => names.forEach((n) => allStudents.add(n)))
        const days: TeacherDay[] = [...byDay.entries()]
          .map(([date, names]) => ({ date, students: [...names].sort((a, b) => a.localeCompare(b, 'vi')) }))
          .sort((a, b) => b.date.localeCompare(a.date))
        return [name, { days: days.length, students: allStudents.size, breakdown: days }] as const
      }),
    )

    const q = search.trim().toLowerCase()
    const filtered = all.filter(
      (r) =>
        (studentFilter === 'all' || r.studentId === studentFilter) &&
        (teacherFilter === 'all' || r.teacherName === teacherFilter) &&
        (!q || r.studentName.toLowerCase().includes(q) || r.teacherName.toLowerCase().includes(q)),
    )

    // Chi tiết theo SỐ BUỔI — vì mỗi học sinh có số buổi riêng, "Buổi 3" của
    // em này có thể rơi vào ngày khác hẳn "Buổi 3" của em khác (hoặc ngược
    // lại: cùng 1 ngày đi học nhưng ghi buổi khác nhau, VD em học trễ tiến
    // độ). Gộp lại theo đúng số buổi là nhóm CHÍNH, bên trong liệt kê rõ
    // từng ngày — chỉ 1 bảng duy nhất, không tách thành nhiều bảng theo ngày
    // riêng dễ nhìn ra số liệu "không khớp nhau".
    //
    // Mỗi ngày được xếp vào nhóm BUỔI PHỔ BIẾN NHẤT hôm đó (hòa thì lấy số
    // nhỏ hơn). Em nào hôm đó học buổi khác số đó vẫn nằm chung dòng/ngày đó,
    // chỉ đánh dấu riêng ở cột Buổi (không tách dòng, không tách bảng).
    const byDateAll = new Map<string, DetailRow[]>()
    filtered.forEach((r) => byDateAll.set(r.date, [...(byDateAll.get(r.date) ?? []), r]))
    const noDateMap = new Map<number, Map<string, DetailRow[]>>()
    byDateAll.forEach((rows, date) => {
      const freq = new Map<number, number>()
      rows.forEach((r) => freq.set(r.no, (freq.get(r.no) ?? 0) + 1))
      const mainNo = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
      const byDateForNo = noDateMap.get(mainNo) ?? new Map<string, DetailRow[]>()
      byDateForNo.set(date, rows)
      noDateMap.set(mainNo, byDateForNo)
    })
    const noGroups: NoGroup[] = [...noDateMap.entries()]
      .map(([no, byDateForNo]) => ({
        no,
        dates: [...byDateForNo.entries()]
          .map(([date, rows]) => ({
            date,
            rows: [...rows].sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '')),
            teachers: [...new Set(rows.filter((r) => r.isOfficialTeacher).map((r) => r.teacherName))],
            editors: [...new Set(rows.filter((r) => !r.isOfficialTeacher).map((r) => r.teacherName))],
          }))
          .sort((a, b) => b.date.localeCompare(a.date)), // ngày gần nhất lên đầu
      }))
      .sort((a, b) => b.no - a.no) // buổi gần nhất (số lớn) lên đầu

    return {
      byStudent: [...studentCount.entries()].sort((a, b) => b[1] - a[1]),
      byTeacher: [...teacherCount.entries()].sort((a, b) => b[1].days - a[1].days),
      byNo: noGroups,
      teacherNames: [...teacherDayStudents.keys()].sort((a, b) => a.localeCompare(b, 'vi')),
      totalRows: filtered.length,
      duplicateCount: filtered.filter((r) => r.isDuplicateDay).length,
    }
  }, [cls, month, studentFilter, teacherFilter, search])

  function toggleNo(no: number) {
    setExpandedNos((prev) => {
      const next = new Set(prev)
      if (next.has(no)) next.delete(no)
      else next.add(no)
      return next
    })
  }

  function handleDateChange(row: DetailRow, newDate: string): boolean {
    const oldDate = row.date
    const chk = dateChangeCheck(cls.students, row.studentId, row.sessionId, newDate)
    if (chk.block) { toast.error(chk.block, { persist: true }); return false }
    if (chk.confirm && !confirm(chk.confirm)) return false
    update((c) => {
      const s = c.students.find((y) => y.id === row.studentId)
      const ss = s?.sessions.find((y) => y.id === row.sessionId)
      if (ss) ss.date = newDate
    })
    if (isMongoid(row.sessionId)) {
      sessionService
        .update(row.sessionId, { scheduledAt: `${newDate}T00:00:00.000Z` })
        .catch((err: unknown) => {
          const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
          toast.error(`${msg ?? `Lỗi khi lưu ngày mới của Buổi ${row.no} (${row.studentName}) lên server.`} Đã khôi phục ngày cũ.`, { persist: true })
          update((c) => {
            const s = c.students.find((y) => y.id === row.studentId)
            const ss = s?.sessions.find((y) => y.id === row.sessionId)
            if (ss) ss.date = oldDate
          })
        })
    }
    return true
  }

  async function handleDeleteRow(row: DetailRow) {
    const stu = cls.students.find((y) => y.id === row.studentId)
    const full = stu?.sessions.find((y) => y.id === row.sessionId)
    // Buổi còn dữ liệu CHƯA lên server → vào kho giữ lại, không mất trắng.
    const orphan = stu && full ? orphanForLocalDelete(cls, stu, full) : null
    const label = sessionLabelOf(row.no, cls.perMonth, stu?.sessionOffset)
    const msg = orphan
      ? `${label} (${viDate(row.date)}) của ${row.studentName} CHƯA lên server và CÓ điểm/điểm danh. Xóa sẽ chuyển buổi này vào "kho giữ lại" (admin xem được ở Sao lưu → Dữ liệu kẹt). Vẫn xóa?`
      : `Xóa ${label} (${viDate(row.date)}) của ${row.studentName}? Các buổi phía sau lùi lên 1 số để không trống số. Khôi phục lại được ở Lớp học → "🗑️ Buổi đã xóa".`
    if (!confirm(msg)) return
    if (isMongoid(row.sessionId)) {
      try {
        await sessionService.remove(row.sessionId)
      } catch (err) {
        toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? `Lỗi khi xóa Buổi ${row.no} trên server. Thử lại.`, { persist: true })
        return
      }
    }
    if (orphan) {
      useAppStore.getState().setData((d) => { d.orphans = appendOrphans(d.orphans, [orphan]) })
      logActivity('session.deleteLocal', { className: cls.name, studentName: row.studentName, sessionNo: row.no, date: row.date }, 'ClassSession')
    }
    toast.success(`Đã xóa ${label} của ${row.studentName}`)
    update((c) => {
      const s = c.students.find((y) => y.id === row.studentId)
      if (!s) return
      // Server đã lùi số các buổi phía sau trong cùng giao dịch xóa (10/11: số buổi luôn 1..n).
      removeSessionLocally(s, row.sessionId, isMongoid(row.sessionId))
    })
  }

  /** Thêm 1 buổi cho 1 em: server xếp buổi vào ĐÚNG vị trí theo ngày (các buổi sau lùi 1 số) —
   *  không gõ số tay nữa (10/11: số buổi luôn 1..n; gõ "Buổi 15" khi em mới 13 buổi từng tạo số
   *  nhảy cóc). Chỉ hiện trên máy SAU KHI server xác nhận. */
  async function handleAddSession() {
    if (addingRef.current) return
    const student = cls.students.find((s) => s.id === addStudentId)
    if (!student) return
    // Trước 09/11 chỉ cảnh báo rồi vẫn tạo → 2 buổi cùng ngày, kỳ học phí đếm dư
    // buổi. Giờ chặn hẳn (server cũng chặn — dateMoveBlockReason).
    const sameDateOther = student.sessions.find((s) => s.date === addDate)
    if (sameDateOther) {
      toast.error(
        `${student.name} đã có ${sessionLabelOf(sameDateOther.no, cls.perMonth, student.sessionOffset)} ngày ${viDate(addDate)} rồi — 1 em không học 2 buổi cùng ngày. Chưa tạo gì. Sai ngày thì sửa ngày buổi kia.`,
        { persist: true },
      )
      return
    }
    const dayCheck = dateChangeCheck(cls.students, addStudentId, null, addDate)
    if (dayCheck.confirm && !confirm(dayCheck.confirm)) return
    const willBe = insertNoByDate(student.sessions, addDate)
    const later = student.sessions.filter((s) => s.no >= willBe).length
    if (later && !confirm(`Buổi ngày ${viDate(addDate)} sẽ là ${sessionLabelOf(willBe, cls.perMonth, student.sessionOffset)} của ${student.name}. ${later} buổi sau ngày này lùi xuống 1 số. Thêm?`)) return
    if (!isMongoid(cls.id) || !isMongoid(addStudentId)) {
      toast.error('Lớp/học sinh này chưa lên server — chưa thêm buổi được.', { persist: true })
      return
    }
    addingRef.current = true
    setAdding(true)
    try {
      const apiSession = await sessionService.create({
        classId: cls.id, studentId: addStudentId, title: `Buổi ${willBe}`,
        lessonNo: willBe, scheduledAt: `${addDate}T00:00:00.000Z`, placeByDate: true,
      })
      const no = apiSession.lessonNo ?? willBe
      update((c) => {
        const s = c.students.find((y) => y.id === addStudentId)
        if (!s) return
        s.sessions.push({ id: apiSession._id, no, date: addDate, homework: '', entry: emptyEntry(), savedAt: Date.now() })
        makeRoomForServerNo(s, apiSession._id, no)
      })
      logActivity('session.create', { className: cls.name, sessionNo: no, studentName: student.name }, 'ClassSession')
      toast.success(`Đã thêm ${sessionLabelOf(no, cls.perMonth, student.sessionOffset)} cho ${student.name} (${viDate(addDate)})`)
      setShowAdd(false)
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`${msg ?? 'Lỗi khi lưu lên server.'} Chưa thêm buổi nào — thử lại.`, { persist: true })
    } finally {
      addingRef.current = false
      setAdding(false)
    }
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
          <select
            value={teacherFilter}
            onChange={(x) => setTeacherFilter(x.target.value)}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            <option value="all">Tất cả giáo viên</option>
            {teacherNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(x) => setSearch(x.target.value)}
            placeholder="🔍 Tìm theo tên học sinh hoặc giáo viên"
            className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <Btn kind="solid" onClick={() => setShowAdd((v) => !v)}>+ Thêm buổi</Btn>
          <Btn
            onClick={async () => {
              const { exportSessionStats } = await import('@/utils/excel')
              exportSessionStats(cls, month)
            }}
          >
            📊 Xuất Excel
          </Btn>
        </div>

        {showAdd && (
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl p-3" style={{ background: C.paper }}>
            <label className="text-xs">
              <div style={{ color: C.muted }}>Học sinh</div>
              <select
                value={addStudentId}
                aria-label="Học sinh thêm buổi"
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
              <div style={{ color: C.muted }}>Ngày</div>
              <input
                type="date"
                value={addDate}
                aria-label="Ngày buổi thêm"
                onChange={(x) => setAddDate(x.target.value)}
                className="mt-1 rounded-lg px-2 py-1.5 text-sm"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            {(() => {
              const stu = cls.students.find((s) => s.id === addStudentId)
              if (!stu || !addDate) return null
              const willBe = insertNoByDate(stu.sessions, addDate)
              return (
                <div className="pb-2 text-xs" style={{ color: C.muted }} data-testid="add-will-be">
                  → sẽ là <b style={{ color: C.ink }}>{sessionLabelOf(willBe, cls.perMonth, stu.sessionOffset)}</b> (xếp theo ngày)
                </div>
              )
            })()}
            <Btn kind="solid" onClick={handleAddSession} disabled={!addStudentId || adding} loading={adding}>Thêm</Btn>
            <Btn kind="ghost" onClick={() => setShowAdd(false)}>Hủy</Btn>
          </div>
        )}
      </Card>

      {totalRows === 0 && latestMonthWithData && latestMonthWithData !== month && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm"
          style={{ background: C.gold + '18', border: `1px solid ${C.gold}66` }}
        >
          <span style={{ color: '#7A5A05' }}>
            Tháng {Number(month.slice(5, 7))}/{month.slice(0, 4)} chưa có buổi nào — <b>dữ liệu không mất</b>, chỉ
            đang xem nhầm tháng thôi.
          </span>
          <Btn kind="gold" size="sm" onClick={() => setMonth(latestMonthWithData)}>
            Xem tháng {Number(latestMonthWithData.slice(5, 7))}/{latestMonthWithData.slice(0, 4)} (có dữ liệu)
          </Btn>
        </div>
      )}

      {duplicateCount > 0 && (
        <div
          className="rounded-2xl px-4 py-3 text-sm"
          style={{ background: C.rose + '14', border: `1px solid ${C.rose}44`, color: '#9F1239' }}
        >
          ⚠ Phát hiện {duplicateCount} buổi bị <b>chấm trùng ngày</b> (1 em có 2+ bản ghi khác số buổi trong cùng 1
          ngày — thường do chấm nhầm 2 lần). Các dòng này được tô đỏ trong bảng "Chi tiết theo Buổi" bên dưới — bấm
          vào xem kỹ rồi tự Xóa bớt bản dư (không tự xóa giúp vì không chắc bản nào đúng).
        </div>
      )}

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
          <div className="space-y-1.5">
            {byTeacher.length === 0 && <span className="text-sm" style={{ color: C.muted }}>Chưa có buổi nào.</span>}
            {byTeacher.map(([name, n]) => {
              const isOpen = expandedTeacher === name
              return (
                <div key={name}>
                  <button
                    onClick={() => setExpandedTeacher(isOpen ? null : name)}
                    className="w-full rounded-lg px-2 py-1 text-left text-xs font-semibold"
                    style={{ background: C.paper, border: `1px solid ${C.line}` }}
                  >
                    {isOpen ? '▾' : '▸'} {name}: <b style={{ color: C.board2 }}>{n.days} buổi</b> · <b style={{ color: C.board2 }}>{n.students} học sinh</b>
                  </button>
                  {isOpen && (
                    <div className="mt-1 space-y-1 pl-4">
                      {n.breakdown.map((d) => (
                        <div key={d.date} className="text-xs" style={{ color: C.muted }}>
                          <b style={{ color: C.ink }}>{viDate(d.date)}</b> — {d.students.length} học sinh: {d.students.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
          <div className="text-xs opacity-80">{month} · {totalRows} buổi</div>
          <div className="text-lg font-bold">Chi tiết theo Buổi</div>
          <div className="text-xs opacity-80">
            Gộp theo đúng số buổi — em nào ngày đó ghi buổi khác số buổi chính thì đánh dấu riêng ở cột Buổi, không
            tách bảng.
          </div>
        </div>
        {byNo.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Không có buổi nào khớp với bộ lọc.</div>
        ) : (
          <div className="max-h-[640px] overflow-y-auto">
            {byNo.map((g) => {
              const isOpen = expandedNos.has(g.no)
              const totalStudents = new Set(g.dates.flatMap((d) => d.rows.map((r) => r.studentId))).size
              return (
                <div key={g.no} style={{ borderTop: `1px solid ${C.line}` }}>
                  <button
                    onClick={() => toggleNo(g.no)}
                    className="flex w-full items-center justify-between px-4 py-2 text-left"
                    style={{ background: C.paper }}
                  >
                    <span className="text-sm font-bold" style={{ color: C.ink }}>
                      {isOpen ? '▾' : '▸'} {sessionLabelOf(g.no, cls.perMonth)}
                    </span>
                    <span className="text-xs" style={{ color: C.muted }}>
                      {totalStudents} em · {g.dates.map((d) => viDate(d.date)).join(' · ')}
                    </span>
                  </button>
                  {isOpen && g.dates.map((d) => (
                    <div key={d.date}>
                      <div className="px-4 py-1.5 text-xs font-semibold" style={{ background: '#FAFAFA', color: C.muted }}>
                        {viDate(d.date)} · {d.rows.length} em
                        {d.teachers.length ? ` · GV: ${d.teachers.join(', ')}` : ''}
                        {d.editors.length ? (
                          <span style={{ color: C.gold }}> · ✎ sửa bởi: {d.editors.join(', ')} (không phải GV lớp)</span>
                        ) : ''}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <tbody>
                            {d.rows.map((r) => {
                              const st = ATTEND_STYLE[r.attendance]
                              return (
                                <tr
                                  key={r.sessionId}
                                  style={{
                                    borderTop: `1px solid ${C.line}`,
                                    background: r.isDuplicateDay ? C.rose + '14' : undefined,
                                  }}
                                >
                                  <td
                                    className="py-2 pl-6 pr-3 font-bold"
                                    style={{ width: 70, color: r.no !== g.no ? C.gold : C.ink }}
                                    title={r.no !== g.no ? `Buổi riêng của em này (${r.no}) khác buổi chính (${g.no}) của ngày này` : undefined}
                                  >
                                    {(() => {
                                      const off = cls.students.find((x) => x.id === r.studentId)?.sessionOffset
                                      const { period, displayNo, blockSize } = periodPositionOf(r.no, cls.perMonth, off)
                                      return `T${period}·B${displayNo}/${blockSize}`
                                    })()}{r.no !== g.no ? ' *' : ''}
                                  </td>
                                  <td className="py-2 px-2" style={{ width: 132 }}>
                                    <DateCommitInput
                                      value={r.date}
                                      onCommit={(d) => handleDateChange(r, d)}
                                      ariaLabel={`Ngày Buổi ${r.no} của ${r.studentName}`}
                                      className="w-full rounded-lg px-1.5 py-1 text-xs"
                                      style={{ border: `1px solid ${C.line}` }}
                                    />
                                  </td>
                                  <td className="py-2 px-3" style={{ width: 90, color: r.recordedAt ? C.ink : C.muted }}>
                                    {r.recordedAt ? viDateTime(r.recordedAt).split(' ')[1] : '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    {r.studentName}
                                    {r.isDuplicateDay && (
                                      <span className="ml-1 font-semibold" style={{ color: C.rose }} title="Em này có 2+ bản ghi buổi trong cùng ngày này — khả năng cao chấm trùng">
                                        ⚠ trùng ngày
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span
                                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                                      style={{ background: st.bg, color: st.fg }}
                                    >
                                      {st.label}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3" style={{ color: r.isOfficialTeacher ? C.muted : C.gold }} title={r.isOfficialTeacher ? undefined : 'Không phải giáo viên chính thức của lớp — người này chỉ tạo/sửa hộ bản ghi'}>
                                    {r.isOfficialTeacher ? r.teacherName : `✎ ${r.teacherName}`}
                                  </td>
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
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
