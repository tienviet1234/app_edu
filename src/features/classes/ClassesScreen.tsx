import { useState, useMemo, useRef } from 'react'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { RUBRICS, getClassRubric, autoLevel } from '@/constants/rubrics'
import { sessionScore, sessionComps } from '@/business/scoring'
import { uid } from '@/utils/uid'
import { round1, viDate } from '@/utils/format'
import { rankingOf } from '@/business/ranking'
import { teachingDaysOf } from '@/business/stats'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { classService } from '@/services/classes'
import { studentService } from '@/services/students'
import { sessionService } from '@/services/sessions'
import { useClassStudents } from '@/hooks'
import { useAuthStore } from '@/store/authStore'
import { isMongoid } from '@/utils/mongoid'
import { toast } from '@/store/toastStore'
import { appendOrphans, orphanForLocalDelete, collectOrphans } from '@/business/sync'
import { levelChangeConfirm, offsetChangeConfirm, removeStudentConfirm } from '@/business/classActions'
import { useActionLock } from '@/hooks/useActionLock'
import { NumberCommitInput } from '@/components/molecules/NumberCommitInput'
import { dateChangeCheck } from '@/business/sessionDates'
import { removeSessionLocally } from '@/business/resequence'
import { sessionLabelOf } from '@/business/tuition'
import { ResequenceSessionsModal } from '@/features/entry/ResequenceSessionsModal'
import { DateCommitInput } from '@/components/molecules/DateCommitInput'
import { logActivity } from '@/services/activity'
import { DeletedSessionsPanel } from './DeletedSessionsPanel'
import { StudentMergeModal } from './StudentMergeModal'
import { AssistantTeachersPanel } from './AssistantTeachersPanel'

function parseBulk(text: string): ClassData[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((l) => l.length)
    .map((lines) => {
      const [head, ...rest] = lines
      const parts = head.split('|').map((x) => x.trim())
      const level = autoLevel(parts[0])
      return {
        id: uid(),
        name: parts[0],
        teacher: parts[1] ?? '',
        level,
        perMonth: level === 'primary' ? 8 : 12,
        students: rest
          .flatMap((l) => l.split(','))
          .map((x) => x.trim())
          .filter(Boolean)
          .map((n) => ({ id: uid(), name: n, sessions: [] })),
        comments: {},
      }
    })
}

interface ClassesScreenProps {
  data: AppData
  setData: (fn: (d: AppData) => void) => void
  current: number
  setCurrent: (i: number) => void
}

export function ClassesScreen({ data, setData, current, setCurrent }: ClassesScreenProps) {
  const [names, setNames] = useState('')
  const [bulk, setBulk] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [joinCode, setJoinCode] = useState<string | null>(null)
  const [joinCodeLoading, setJoinCodeLoading] = useState(false)
  const [sessionTab, setSessionTab] = useState<'students' | 'sessions'>('students')
  const [sessionStudentIdx, setSessionStudentIdx] = useState(0)
  // Em đang mở hộp "Sửa số buổi" (nút ✎ ở bảng Buổi học) — đổi số cả dãy cùng lúc.
  const [reseqStudentId, setReseqStudentId] = useState<string | null>(null)
  const [showDeletedSessions, setShowDeletedSessions] = useState(false)
  const [mergeStudent, setMergeStudent] = useState<{ id: string; name: string } | null>(null)
  const [importError, setImportError] = useState('')
  const xlsxRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()
  const cls = data.classes[current]
  const edit = (fn: (c: ClassData) => void) => setData(produce((d) => fn(d.classes[current])))

  const preview = useMemo(() => parseBulk(bulk), [bulk])

  const { data: apiStudents } = useClassStudents(cls && isMongoid(cls.id) ? cls.id : '')

  const lock = useActionLock()
  const serverMsg = (err: unknown) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  // Giá trị lúc bắt đầu sửa ô tên lớp / giáo viên — lưu lỗi thì trả về giá trị này.
  const focusValRef = useRef('')

  /** Lưu 1 thuộc tính lớp lên server. Trước 11/11 nuốt lỗi im lặng ("best effort") — đổi CẤP LỚP
   *  (8 ↔ 12 buổi/kỳ = đổi học phí) lỗi mà máy vẫn hiện giá trị mới. Giờ lỗi thì báo + trả lại. */
  async function syncFieldToApi(field: string, value: unknown, revert: (c: ClassData) => void): Promise<boolean> {
    if (!cls || !isMongoid(cls.id)) return true
    const id = cls.id
    try {
      await classService.update(id, { [field]: value })
      return true
    } catch (err) {
      toast.error(`${serverMsg(err) ?? 'Không lưu được lên server.'} Đã trả lại giá trị cũ.`, { persist: true })
      setData(produce((d: AppData) => { const c = d.classes.find((x) => x.id === id); if (c) revert(c) }))
      return false
    }
  }

  async function syncStudentName(studentId: string, name: string) {
    if (!isMongoid(studentId) || !name.trim()) return
    try {
      await studentService.update(studentId, { name: name.trim() })
    } catch {
      toast.error('Lưu tên học sinh thất bại, thử lại.')
    }
  }

  /** Số buổi học sinh ĐÃ HỌC TRƯỚC KHI vào app (học sinh chuyển vào giữa
   *  chừng, VD học xong 9 buổi ở sổ giấy rồi mới ghi app) — buổi đầu tiên ghi
   *  trong app sẽ tự đánh số tiếp theo (offset+1) và mốc tính đủ kỳ 8/12
   *  buổi cũng cộng dồn đúng, xem business/tuition.ts. */
  // Gõ xong mới lưu (NumberCommitInput), hỏi lại nêu buổi đầu sẽ thành gì; server xác nhận rồi mới
  // đổi trên máy. Trước 11/11 lưu ở MỖI lần gõ và đổi trên máy trước, lỗi không trả lại.
  async function syncStudentOffset(studentId: string, offset: number): Promise<boolean> {
    const st = cls?.students.find((y) => y.id === studentId)
    if (!cls || !st) return false
    const r = await lock.run(`offset:${studentId}`, async () => {
      if (!confirm(offsetChangeConfirm(st.name, st.sessionOffset ?? 0, offset, cls.perMonth))) return false
      if (isMongoid(studentId)) {
        try {
          await studentService.update(studentId, { sessionOffset: offset })
        } catch (err) {
          toast.error(`${serverMsg(err) ?? 'Lưu số buổi đã học trước thất bại.'} Chưa đổi gì — thử lại.`, { persist: true })
          return false
        }
      }
      edit((c) => {
        const found = c.students.find((y) => y.id === studentId)
        if (found) found.sessionOffset = offset
      })
      toast.success(`Đã lưu: ${st.name} đã học ${offset} buổi trước khi vào app.`)
      return true
    })
    return !r.skipped && r.value
  }

  async function handleDeleteClass(idx: number) {
    await lock.run('deleteClass', () => handleDeleteClassLocked(idx))
  }

  async function handleDeleteClassLocked(idx: number) {
    const c = data.classes[idx]
    // Server chỉ cho xóa lớp CHƯA có buổi nào (classDeleteBlockReason) — lớp thôi học thì đổi trạng thái.
    if (!confirm(`Xóa lớp "${c.name}"? Chỉ xóa được lớp chưa có buổi học nào trên server. Buổi chưa lên server (nếu có) chuyển vào "kho giữ lại".`)) return
    if (isMongoid(c.id)) {
      try {
        await classService.delete(c.id)
      } catch (err) {
        const reason = (err as { response?: { data?: { message?: string } } }).response?.data?.message
        toast.error(reason ?? `Xóa lớp "${c.name}" thất bại, thử lại.`, { persist: !!reason })
        return // không xóa local nếu server thất bại — tránh lớp "hồi sinh" sau khi đồng bộ lại
      }
    }
    // Buổi chưa lên server không được mất trắng — vào kho giữ lại (collectOrphans).
    const orphans = collectOrphans(c, 'all', 'classRemoved')
    setData(produce((d: AppData) => {
      if (orphans.length) d.orphans = appendOrphans(d.orphans, orphans)
      d.classes.splice(idx, 1)
    }))
    setCurrent(Math.max(0, idx > 0 ? idx - 1 : 0))
  }

  async function handleDeleteStudent(studentId: string, studentName: string) {
    await lock.run(`removeStudent:${studentId}`, () => handleDeleteStudentLocked(studentId, studentName))
  }

  async function handleDeleteStudentLocked(studentId: string, studentName: string) {
    if (!cls) return
    const st = cls.students.find((y) => y.id === studentId)
    const orphans = collectOrphans(cls, new Set([studentId]), 'studentRemoved')
    const unsent = orphans.reduce((n, o) => n + o.sessions.length, 0)
    if (!confirm(removeStudentConfirm(studentName, cls.name, st?.sessions ?? [], unsent))) return
    if (isMongoid(cls.id) && isMongoid(studentId)) {
      try {
        await classService.removeStudent(cls.id, studentId)
      } catch (err) {
        toast.error(`${serverMsg(err) ?? `Gỡ "${studentName}" thất bại.`} Chưa gỡ — thử lại.`, { persist: true })
        return
      }
    }
    // Buổi chưa lên server của em này vào kho giữ lại — trước 11/11 lọc thẳng, mất trắng.
    const id = cls.id
    setData(produce((d: AppData) => {
      if (orphans.length) d.orphans = appendOrphans(d.orphans, orphans)
      const c = d.classes.find((x) => x.id === id)
      if (c) c.students = c.students.filter((y) => y.id !== studentId)
    }))
    toast.success(`Đã gỡ ${studentName} khỏi ${cls.name}.`)
  }

  async function loadJoinCode() {
    if (!cls || !isMongoid(cls.id)) return
    setJoinCodeLoading(true)
    try {
      const res = await classService.getJoinCode(cls.id)
      setJoinCode(res.joinCode)
    } catch {
      setJoinCode(null)
    } finally {
      setJoinCodeLoading(false)
    }
  }

  async function tryCreateInApi(name: string): Promise<string> {
    try {
      const apiClass = await classService.create({
        name,
        teacherId: user?.id,
        status: 'active',
        academicYear: String(new Date().getFullYear()),
      })
      return apiClass._id
    } catch {
      return uid()
    }
  }

  // Khôi phục học sinh đang kẹt local-only (thêm khi lớp chưa có ID server,
  // hoặc thêm qua Excel import trước khi luồng này được đồng bộ) lên server thật.
  async function syncLocalOnlyStudents() {
    if (!cls || !isMongoid(cls.id)) return
    const localOnly = cls.students.filter((s) => !isMongoid(s.id))
    if (!localOnly.length) return
    if (!confirm(`Đồng bộ ${localOnly.length} học sinh đang lưu tạm trên máy này lên server?`)) return

    setSyncing(true)
    try {
      const created = await classService.addManagedStudents(cls.id, localOnly.map((s) => s.name))
      setData(produce((d: AppData) => {
        const c = d.classes[current]
        localOnly.forEach((oldSt, i) => {
          const newSt = created[i]
          if (!newSt) return
          // Buổi học nằm ngay trong student object — đổi id là đủ, không cần
          // remap gì thêm (khác trước đây khi entries nằm ở cấp lớp).
          const student = c.students.find((s) => s.id === oldSt.id)
          if (student) student.id = newSt._id
        })
      }))
      toast.success(`Đã đồng bộ ${created.length} học sinh lên server thành công.`)
    } catch (err: unknown) {
      const detail = (err as { response?: { status?: number; data?: { message?: string } } })?.response
      const msg = detail?.data?.message
      console.error('syncLocalOnlyStudents error:', err)
      toast.error(`Lỗi khi đồng bộ${detail?.status ? ` (${detail.status})` : ''}${msg ? `: ${msg}` : ''}`, { persist: true })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold" style={{ color: C.muted }}>
          TẠO NHIỀU LỚP CÙNG LÚC
        </div>
        <div className="mb-2 text-xs" style={{ color: C.muted }}>
          Mỗi lớp cách nhau <b>một dòng trống</b>. Dòng đầu:{' '}
          <b>Tên lớp | Giáo viên</b>. Các dòng sau là học sinh. Lớp 1–5 tự dùng phiếu Cấp 1, lớp
          6–12 dùng phiếu Cấp 2 & 3.
        </div>
        <textarea
          value={bulk}
          onChange={(x) => setBulk(x.target.value)}
          rows={7}
          placeholder={'Lớp 3B | Cô Oanh\nBin, Su, Bống, Nam\n\nLớp 6A | Cô Oanh\nMinh\nAn\nHuy'}
          className="w-full rounded-xl p-3 text-sm"
          style={{ border: `1px solid ${C.line}`, fontFamily: 'ui-monospace, monospace' }}
        />
        {preview.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.map((c, i) => (
              <span
                key={i}
                className="rounded-lg px-2 py-1 text-xs font-semibold"
                style={{ background: C.paper, border: `1px solid ${C.line}` }}
              >
                {c.name} · {c.students.length} HS · {RUBRICS[c.level].label}
              </span>
            ))}
          </div>
        )}
        <Btn
          kind="solid"
          className="mt-2"
          disabled={syncing}
          onClick={async () => {
            if (!preview.length) return
            setSyncing(true)
            // Tạo lớp trên server TRƯỚC, rồi đẩy luôn danh sách học sinh vừa
            // dán lên server (giống hệt nhánh "Thêm thủ công" đã làm đúng) —
            // trước đây chỉ tạo lớp, học sinh bị bỏ quên ở local, máy khác
            // đăng nhập cùng tài khoản sẽ thấy lớp rỗng không có học sinh.
            const settled = await Promise.allSettled(
              preview.map(async (c) => {
                const newId = await tryCreateInApi(c.name)
                if (isMongoid(newId) && c.students.length) {
                  try {
                    const created = await classService.addManagedStudents(newId, c.students.map((s) => s.name))
                    return { ...c, id: newId, students: created.map((s) => ({ id: s._id, name: s.name, sessions: [] })) }
                  } catch {
                    // Lớp tạo được nhưng học sinh lỗi — giữ học sinh local-only,
                    // banner cảnh báo trong trang chi tiết lớp sẽ nhắc đồng bộ lại.
                    return { ...c, id: newId }
                  }
                }
                return { ...c, id: newId }
              }),
            )
            const classes = settled.map((r, i) =>
              r.status === 'fulfilled' ? r.value : preview[i],
            )
            setData(produce((d) => { classes.forEach((c) => d.classes.push(c)) }))
            setCurrent(data.classes.length)
            setBulk('')
            setSyncing(false)
          }}
        >
          {syncing ? 'Đang tạo...' : `Tạo ${preview.length || ''} lớp`}
        </Btn>
      </Card>

      <div className="grid gap-2 md:grid-cols-2">
        {data.classes.map((c, i) => {
          const rk = rankingOf(c)
          const avg = rk.length ? rk.reduce((a, b) => a + b.s.monthTotal, 0) / rk.length : 0
          const totalSessions = teachingDaysOf(c)
          const due = c.students.some(
            (st) => st.sessions.length > 0 && st.sessions.length % c.perMonth === 0,
          )
          return (
            <Card
              key={c.id}
              className="p-4"
              style={{ borderColor: i === current ? C.board : C.line, borderWidth: i === current ? 2 : 1 }}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 cursor-pointer" onClick={() => setCurrent(i)}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-lg font-bold">
                        {c.name}
                        {isMongoid(c.id) && (
                          <span title="Đã đồng bộ lên server" style={{ color: C.board2, fontSize: 14 }}>
                            ☁
                          </span>
                        )}
                      </div>
                      <div className="text-sm" style={{ color: C.muted }}>
                        {c.students.length} học sinh · {c.teacher || 'chưa có GV'} ·{' '}
                        {RUBRICS[c.level].label}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">
                        Tổng buổi: {totalSessions}
                      </div>
                      <div className="text-xs" style={{ color: C.muted }}>
                        TB lớp {round1(avg)}
                      </div>
                    </div>
                  </div>
                  {due && (
                    <div
                      className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{ background: C.gold + '22', color: '#7A5A05' }}
                    >
                      ⏰ Đã đến kỳ gửi báo cáo
                    </div>
                  )}
                </div>
                <button
                  title="Xóa lớp này"
                  onClick={() => handleDeleteClass(i)}
                  className="rounded-lg px-2 py-1 text-xs font-bold opacity-40 hover:opacity-100"
                  style={{ color: C.red, flexShrink: 0 }}
                >
                  Xóa
                </button>
              </div>
            </Card>
          )
        })}
        <Card className="flex items-center justify-center p-4">
          <Btn
            kind="solid"
            onClick={async () => {
              const newId = await tryCreateInApi('Lớp mới')
              setData(
                produce((d) => {
                  d.classes.push({
                    id: newId,
                    name: 'Lớp mới',
                    teacher: '',
                    level: 'primary',
                    perMonth: 8,
                    students: [],
                    comments: {},
                  })
                }),
              )
              setCurrent(data.classes.length)
            }}
          >
            + Thêm lớp
          </Btn>
        </Card>
      </div>

      {cls && (
        <Card className="p-4">
          <div className="mb-3 text-sm font-bold" style={{ color: C.muted }}>
            THIẾT LẬP {cls.name.toUpperCase()}
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="text-sm">
              <div style={{ color: C.muted }}>Tên lớp</div>
              <input
                value={cls.name}
                onFocus={(x) => { focusValRef.current = x.target.value }}
                onChange={(x) => edit((c) => { c.name = x.target.value })}
                onBlur={(x) => { const old = focusValRef.current; if (x.target.value !== old) void syncFieldToApi('name', x.target.value, (c) => { c.name = old }) }}
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Giáo viên</div>
              <input
                value={cls.teacher}
                onFocus={(x) => { focusValRef.current = x.target.value }}
                onChange={(x) => edit((c) => { c.teacher = x.target.value })}
                onBlur={(x) => { const old = focusValRef.current; if (x.target.value !== old) void syncFieldToApi('teacherName', x.target.value, (c) => { c.teacher = old }) }}
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Phiếu đánh giá</div>
              <select
                value={cls.level}
                onChange={(x) => {
                  const lvl = x.target.value as 'primary' | 'secondary'
                  const old = cls.level
                  // Đổi cấp lớp = đổi 8 ↔ 12 buổi/kỳ = đổi học phí: hỏi lại, lỗi thì trả lại.
                  if (!confirm(levelChangeConfirm(cls.name, lvl))) return
                  edit((c) => {
                    c.level = lvl
                    c.perMonth = lvl === 'primary' ? 8 : 12
                  })
                  void syncFieldToApi('level', lvl, (c) => { c.level = old; c.perMonth = old === 'primary' ? 8 : 12 })
                }}
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              >
                <option value="primary">Cấp 1 (lớp 1–5) — 8 buổi/tháng</option>
                <option value="secondary">Cấp 2 & 3 (lớp 6–12) — 12 buổi/tháng</option>
              </select>
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Chu kỳ báo cáo</div>
              <div className="mt-1 rounded-xl px-3 py-2 text-sm" style={{ background: C.paper }}>
                {cls.perMonth === 8 ? 'Sau buổi 8' : 'Sau buổi 6 và 12'}
              </div>
            </label>
          </div>

          {isMongoid(cls.id) && (
            <div className="mt-3">
              <AssistantTeachersPanel classId={cls.id} />
            </div>
          )}

          {/* Tab: Học sinh / Buổi học */}
          <div className="mt-4">
            <div className="flex gap-1 mb-3">
              {(['students', 'sessions'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSessionTab(t)}
                  className="rounded-xl px-4 py-1.5 text-sm font-semibold"
                  style={{
                    background: sessionTab === t ? C.board : C.paper,
                    color: sessionTab === t ? '#fff' : C.muted,
                  }}
                >
                  {t === 'students' ? `Học sinh (${cls.students.length})` : `Buổi học (${teachingDaysOf(cls)})`}
                </button>
              ))}
            </div>

            {sessionTab === 'students' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-sm" style={{ color: C.muted }}>
                    Thêm thủ công (mỗi dòng một tên)
                  </div>
                  <textarea
                    value={names}
                    onChange={(x) => setNames(x.target.value)}
                    rows={4}
                    placeholder={'Minh\nAn\nHuy'}
                    className="w-full rounded-xl p-3 text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <Btn
                      kind="solid"
                      disabled={syncing}
                      onClick={async () => {
                        const list = names.split('\n').map((x) => x.trim()).filter(Boolean)
                        if (!list.length) return

                        // API-synced class → create managed student accounts on server
                        if (cls && isMongoid(cls.id)) {
                          setSyncing(true)
                          try {
                            const created = await classService.addManagedStudents(cls.id, list)
                            setData(produce((d) => {
                              const c = d.classes[current]
                              created.forEach((s) => {
                                if (c.students.some((st: { id: string }) => st.id === s._id)) return
                                c.students.push({ id: s._id, name: s.name, sessions: [] })
                              })
                            }))
                          } catch {
                            toast.error('Lỗi khi thêm học sinh. Thử lại.', { persist: true })
                          } finally {
                            setSyncing(false)
                          }
                        } else {
                          // Local-only class → save to localStorage
                          setData(produce((d) => {
                            const c = d.classes[current]
                            list.forEach((n) => {
                              c.students.push({ id: uid(), name: n, sessions: [] })
                            })
                          }))
                        }
                        setNames('')
                      }}
                    >
                      {syncing ? 'Đang thêm...' : 'Thêm vào lớp'}
                    </Btn>
                    <Btn
                      kind="ghost"
                      onClick={() => xlsxRef.current?.click()}
                      title="Import danh sách học sinh từ file Excel (.xlsx)"
                    >
                      Import từ Excel
                    </Btn>
                    <input
                      ref={xlsxRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        e.target.value = ''
                        setImportError('')
                        try {
                          const { importStudentNames } = await import('@/utils/excel')
                          const parsed = await importStudentNames(file)
                          if (!parsed.length) { setImportError('Không tìm thấy tên học sinh trong file.'); return }
                          const newNames = parsed.filter((n) => !cls.students.some((st2) => st2.name === n))
                          if (!newNames.length) return

                          // API-synced class → create managed student accounts on server (giống nhánh dán tên)
                          if (cls && isMongoid(cls.id)) {
                            setSyncing(true)
                            try {
                              const created = await classService.addManagedStudents(cls.id, newNames)
                              setData(produce((d) => {
                                const c = d.classes[current]
                                created.forEach((s) => {
                                  if (c.students.some((st: { id: string }) => st.id === s._id)) return
                                  c.students.push({ id: s._id, name: s.name, sessions: [] })
                                })
                              }))
                            } catch {
                              setImportError('Lỗi khi thêm học sinh lên server. Thử lại.')
                            } finally {
                              setSyncing(false)
                            }
                          } else {
                            setData(
                              produce((d) => {
                                const c = d.classes[current]
                                newNames.forEach((n) => {
                                  c.students.push({ id: uid(), name: n, sessions: [] })
                                })
                              }),
                            )
                          }
                        } catch {
                          setImportError('Lỗi đọc file. Hãy thử lại với file .xlsx hoặc .csv.')
                        }
                      }}
                    />
                    {importError && <div className="w-full text-xs" style={{ color: C.red }}>{importError}</div>}
                  </div>
                  {cls.students.some((s) => s.sessions.length > 0) && (
                    <Btn kind="ghost" className="mt-2" onClick={() => void import('@/utils/excel').then((m) => m.exportAttendance(cls))}>
                      Xuất điểm danh Excel
                    </Btn>
                  )}
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm" style={{ color: C.muted }}>
                    <span>Danh sách ({cls.students.length})</span>
                  </div>
                  {isMongoid(cls.id) && cls.students.some((s) => !isMongoid(s.id)) && (
                    <div
                      className="mb-2 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs"
                      style={{ background: C.gold + '18', border: `1px solid ${C.gold}55` }}
                    >
                      <span style={{ color: '#7A5A05' }}>
                        ⚠ {cls.students.filter((s) => !isMongoid(s.id)).length} học sinh đang lưu tạm trên máy này, chưa lên server
                      </span>
                      <button
                        onClick={syncLocalOnlyStudents}
                        disabled={syncing}
                        className="ml-auto rounded-lg px-3 py-1 text-xs font-bold"
                        style={{ background: C.gold, color: '#2A1F05' }}
                      >
                        {syncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                      </button>
                    </div>
                  )}
                  <div
                    className="max-h-48 overflow-y-auto rounded-xl p-2"
                    style={{ background: C.paper }}
                  >
                    {cls.students.map((st) => (
                      <div key={st.id} className="flex flex-wrap items-center gap-2 py-1">
                        <input
                          value={st.name}
                          onChange={(x) =>
                            edit((c) => {
                              const found = c.students.find((y) => y.id === st.id)
                              if (found) found.name = x.target.value
                            })
                          }
                          onBlur={(x) => void syncStudentName(st.id, x.target.value)}
                          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                          style={{ border: `1px solid ${C.line}`, background: '#fff' }}
                        />
                        <span
                          className="flex items-center gap-1 text-[11px]"
                          style={{ color: C.muted }}
                          title="Dùng khi học sinh chuyển vào giữa chừng — VD đã học 9 buổi ở sổ giấy trước khi dùng app thì điền 9, buổi đầu ghi trong app sẽ tự thành Buổi 10."
                        >
                          Buổi trước:
                          <NumberCommitInput
                            value={st.sessionOffset ?? 0}
                            min={0}
                            onCommit={(n) => syncStudentOffset(st.id, n)}
                            ariaLabel={`Số buổi đã học trước của ${st.name}`}
                            className="w-12 rounded-lg px-1 py-1 text-center text-xs"
                            style={{ border: `1px solid ${C.line}`, background: '#fff' }}
                          />
                        </span>
                        {isMongoid(st.id) && (
                          <button
                            className="text-xs font-bold"
                            style={{ color: C.board2 }}
                            title="Học sinh này đã chuyển sang lớp khác và bị tạo trùng tài khoản ở lớp mới? Gộp dữ liệu (buổi/điểm/học phí) vào đúng tài khoản đó."
                            onClick={() => setMergeStudent({ id: st.id, name: st.name })}
                          >
                            🔀 Chuyển lớp
                          </button>
                        )}
                        <button
                          className="text-xs font-bold"
                          style={{ color: C.red }}
                          onClick={() => void handleDeleteStudent(st.id, st.name)}
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {sessionTab === 'sessions' && (
              <div>
                {cls.students.length === 0 ? (
                  <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
                    Lớp chưa có học sinh nào.
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm" style={{ color: C.muted }}>Học sinh:</span>
                      <select
                        value={Math.min(sessionStudentIdx, cls.students.length - 1)}
                        onChange={(x) => setSessionStudentIdx(Number(x.target.value))}
                        className="rounded-xl px-3 py-2 text-sm font-semibold"
                        style={{ border: `1px solid ${C.line}` }}
                      >
                        {cls.students.map((s, i) => (
                          <option key={s.id} value={i}>{s.name} ({s.sessions.length} buổi)</option>
                        ))}
                      </select>
                      <Btn onClick={() => setShowDeletedSessions(true)} title="Xem lại và khôi phục các buổi đã xóa của học sinh này">
                        🗑️ Buổi đã xóa
                      </Btn>
                    </div>
                    {(() => {
                      const stu = cls.students[Math.min(sessionStudentIdx, cls.students.length - 1)]
                      const r = getClassRubric(cls)
                      if (!stu.sessions.length) {
                        return (
                          <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
                            {stu.name} chưa có buổi học nào. Vào tab <b>Nhập điểm</b> để thêm buổi đầu tiên.
                          </div>
                        )
                      }
                      return (
                        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                          <table className="w-full text-sm">
                            <thead>
                              <tr style={{ background: C.paper }}>
                                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Buổi</th>
                                <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
                                <th className="py-2 px-3 text-center font-semibold" style={{ color: C.muted }}>Đi học</th>
                                <th className="py-2 px-3 text-center font-semibold" style={{ color: C.muted }}>Điểm</th>
                                <th className="py-2 px-3"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {stu.sessions.map((ss) => {
                                const t = sessionScore(ss.entry, { ...r, comps: sessionComps(r, ss) })
                                const attendLabel: Record<string, string> = {
                                  present: 'Có mặt', late: 'Muộn', excused: 'Phép', absent: 'Vắng',
                                }
                                return (
                                  <tr key={ss.id} style={{ borderTop: `1px solid ${C.line}` }}>
                                    <td className="py-2 px-3">
                                      {/* 10/11: không sửa số lẻ từng buổi ở đây (làm trống/trùng số) — "✎" mở
                                          hộp Sửa số buổi, đổi cả dãy cùng lúc, có kiểm tra 1..n trước khi lưu. */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="whitespace-nowrap font-bold" style={{ color: C.ink }}>
                                          {sessionLabelOf(ss.no, cls.perMonth, stu.sessionOffset)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => setReseqStudentId(stu.id)}
                                          title="Sửa số buổi của em này — mở hộp Sửa số buổi"
                                          aria-label={`Sửa số buổi của ${stu.name}`}
                                          className="text-xs font-bold"
                                          style={{ color: C.board2 }}
                                        >
                                          ✎
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3">
                                      <DateCommitInput
                                        value={ss.date}
                                        ariaLabel={`Ngày Buổi ${ss.no} của ${stu.name}`}
                                        onCommit={(newDate) => {
                                          const oldDate = ss.date
                                          const chk = dateChangeCheck(cls.students, stu.id, ss.id, newDate)
                                          if (chk.block) { toast.error(chk.block, { persist: true }); return false }
                                          if (chk.confirm && !confirm(chk.confirm)) return false
                                          edit((c) => {
                                            const s = c.students.find((y) => y.id === stu.id)
                                            const found = s?.sessions.find((y) => y.id === ss.id)
                                            if (found) found.date = newDate
                                          })
                                          if (isMongoid(ss.id)) {
                                            // Lỗi phải trả lại ngày cũ trên máy (không nuốt lỗi khi ghi).
                                            sessionService
                                              .update(ss.id, { scheduledAt: `${newDate}T00:00:00.000Z` })
                                              .catch((err: unknown) => {
                                                const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
                                                toast.error(`${msg ?? `Lỗi khi lưu ngày mới của Buổi ${ss.no} lên server.`} Đã trả lại ngày ${viDate(oldDate)}.`, { persist: true })
                                                edit((c) => {
                                                  const found = c.students.find((y) => y.id === stu.id)?.sessions.find((y) => y.id === ss.id)
                                                  if (found) found.date = oldDate
                                                })
                                              })
                                          }
                                        }}
                                        className="rounded-lg px-2 py-1 text-sm"
                                        style={{ border: `1px solid ${C.line}` }}
                                      />
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {attendLabel[ss.entry.attendance] ?? '—'}
                                    </td>
                                    <td className="py-2 px-3 text-center font-semibold">
                                      {t !== null ? t : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <button
                                        className="text-xs font-bold"
                                        style={{ color: C.red }}
                                        disabled={lock.isBusy(`delSession:${ss.id}`)}
                                        onClick={() => void lock.run(`delSession:${ss.id}`, async () => {
                                          // Buổi còn dữ liệu CHƯA lên server → vào kho giữ lại, không mất trắng.
                                          const orphan = orphanForLocalDelete(cls, stu, ss)
                                          const msg = orphan
                                            ? `${sessionLabelOf(ss.no, cls.perMonth, stu.sessionOffset)} (${viDate(ss.date)}) của ${stu.name} CHƯA lên server và CÓ điểm/điểm danh. Xóa sẽ chuyển buổi này vào "kho giữ lại" (admin xem được ở Sao lưu → Dữ liệu kẹt). Vẫn xóa?`
                                            : `Xóa ${sessionLabelOf(ss.no, cls.perMonth, stu.sessionOffset)} (${viDate(ss.date)}) của ${stu.name}? Các buổi phía sau lùi lên 1 số để không trống số. (Khôi phục lại được ở nút "🗑️ Buổi đã xóa")`
                                          if (!confirm(msg)) return
                                          if (isMongoid(ss.id)) {
                                            try {
                                              await sessionService.remove(ss.id)
                                            } catch (err) {
                                              toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? `Lỗi khi xóa Buổi ${ss.no} trên server. Thử lại.`, { persist: true })
                                              return
                                            }
                                          }
                                          if (orphan) {
                                            setData(produce((d: AppData) => { d.orphans = appendOrphans(d.orphans, [orphan]) }))
                                            logActivity('session.deleteLocal', { className: cls.name, studentName: stu.name, sessionNo: ss.no, date: ss.date }, 'ClassSession')
                                          }
                                          toast.success(`Đã xóa Buổi ${ss.no} của ${stu.name} — vào "🗑️ Buổi đã xóa" nếu cần khôi phục lại`)
                                          edit((c) => {
                                            const s = c.students.find((y) => y.id === stu.id)
                                            if (!s) return
                                            // Server đã lùi số các buổi phía sau trong cùng giao dịch xóa (10/11:
                                            // số buổi luôn 1..n) — máy làm y hệt.
                                            removeSessionLocally(s, ss.id, isMongoid(ss.id))
                                          })
                                        })}
                                      >
                                        Xóa
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )
                    })()}
                  </>
                )}
                {showDeletedSessions && cls.students.length > 0 && (
                  <DeletedSessionsPanel
                    cls={cls}
                    studentId={cls.students[Math.min(sessionStudentIdx, cls.students.length - 1)].id}
                    edit={edit}
                    onClose={() => setShowDeletedSessions(false)}
                  />
                )}
                {reseqStudentId && cls.students.some((s) => s.id === reseqStudentId) && (
                  <ResequenceSessionsModal
                    cls={cls}
                    studentId={reseqStudentId}
                    update={(fn) => { const id = cls.id; setData(produce((d: AppData) => { const c = d.classes.find((x) => x.id === id); if (c) fn(c) })) }}
                    onClose={() => setReseqStudentId(null)}
                  />
                )}
                {mergeStudent && (
                  <StudentMergeModal
                    fromClassId={cls.id}
                    fromClassName={cls.name}
                    studentId={mergeStudent.id}
                    studentName={mergeStudent.name}
                    onClose={() => setMergeStudent(null)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Join code section — only for API-synced classes */}
          {cls && isMongoid(cls.id) && (
            <div
              className="mt-4 rounded-xl p-4"
              style={{ background: C.board + '0D', border: `1px solid ${C.board}33` }}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.board }}>
                    ☁ MÃ THAM GIA LỚP
                  </div>
                  <div className="text-xs" style={{ color: C.muted }}>
                    Chia sẻ mã này để học sinh tự đăng ký vào lớp
                  </div>
                </div>
                {!joinCode && (
                  <Btn onClick={loadJoinCode} disabled={joinCodeLoading}>
                    {joinCodeLoading ? 'Đang tải...' : 'Xem mã'}
                  </Btn>
                )}
              </div>
              {joinCode && (
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-xl px-6 py-3 text-3xl font-black tracking-widest"
                    style={{ background: C.board, color: '#fff', letterSpacing: '0.25em' }}
                  >
                    {joinCode}
                  </div>
                  <div className="text-xs" style={{ color: C.muted }}>
                    Học sinh vào <b>/app/join</b>{' '}
                    sau khi đăng ký và nhập mã này
                  </div>
                </div>
              )}
              {apiStudents && apiStudents.length > 0 && (
                <div className="mt-3 text-xs" style={{ color: C.muted }}>
                  <b style={{ color: C.board }}>{apiStudents.length} học sinh</b> đã tham gia qua hệ thống:{' '}
                  {apiStudents.map((s) => s.name).join(', ')}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2 text-xs">
            {Object.entries(RUBRICS).map(([k, rb]) => (
              <div
                key={k}
                className="rounded-xl p-3 leading-relaxed"
                style={{
                  background: cls.level === k ? C.board2 + '14' : C.paper,
                  border: `1px solid ${cls.level === k ? C.board2 : C.line}`,
                  color: C.muted,
                }}
              >
                <b style={{ color: C.ink }}>{rb.label} — thang 100:</b>{' '}
                {rb.comps
                  .map(
                    (c) =>
                      `${c.label} ${c.max}${c.type === 'parts' ? ` (${(c.parts ?? []).map((p) => `${p.label} ${p.max}`).join(', ')})` : ''}`,
                  )
                  .join(' · ')}
                {' · '}Chuyên cần 10
                {rb.attendance.mode === 'deduct'
                  ? ' (đi học đúng giờ 10 · muộn −2 · nghỉ phép −3 · nghỉ KP −5 mỗi lần)'
                  : ''}
                .
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
