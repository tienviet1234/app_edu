import { useState, useMemo, useRef } from 'react'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { RUBRICS, getRubric, autoLevel } from '@/constants/rubrics'
import { sessionScore } from '@/business/scoring'
import { uid } from '@/utils/uid'
import { round1, viDate } from '@/utils/format'
import { rankingOf } from '@/business/ranking'
import { teachingDaysOf } from '@/business/stats'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { classService } from '@/services/classes'
import { sessionService } from '@/services/sessions'
import { importStudentNames, exportAttendance } from '@/utils/excel'
import { useClassStudents } from '@/hooks'
import { useAuthStore } from '@/store/authStore'
import { isMongoid } from '@/utils/mongoid'
import { toast } from '@/store/toastStore'

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
  const [importError, setImportError] = useState('')
  const xlsxRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()
  const cls = data.classes[current]
  const edit = (fn: (c: ClassData) => void) => setData(produce((d) => fn(d.classes[current])))
  const preview = useMemo(() => parseBulk(bulk), [bulk])

  const { data: apiStudents } = useClassStudents(cls && isMongoid(cls.id) ? cls.id : '')

  async function syncFieldToApi(field: string, value: unknown) {
    if (!cls || !isMongoid(cls.id)) return
    try { await classService.update(cls.id, { [field]: value }) } catch { /* best effort */ }
  }

  async function handleDeleteClass(idx: number) {
    const c = data.classes[idx]
    if (!confirm(`Xóa lớp "${c.name}"? Toàn bộ dữ liệu lớp này sẽ bị xóa vĩnh viễn.`)) return
    if (isMongoid(c.id)) {
      try { await classService.delete(c.id) } catch { /* keep local delete */ }
    }
    setData(produce((d) => { d.classes.splice(idx, 1) }))
    setCurrent(Math.max(0, idx > 0 ? idx - 1 : 0))
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
            const settled = await Promise.allSettled(
              preview.map(async (c) => ({ ...c, id: await tryCreateInApi(c.name) })),
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
                onChange={(x) => edit((c) => { c.name = x.target.value })}
                onBlur={(x) => void syncFieldToApi('name', x.target.value)}
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Giáo viên</div>
              <input
                value={cls.teacher}
                onChange={(x) => edit((c) => { c.teacher = x.target.value })}
                onBlur={(x) => void syncFieldToApi('teacherName', x.target.value)}
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
                  edit((c) => {
                    c.level = lvl
                    c.perMonth = lvl === 'primary' ? 8 : 12
                  })
                  void syncFieldToApi('level', lvl)
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
                    <Btn kind="ghost" className="mt-2" onClick={() => exportAttendance(cls)}>
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
                      <div key={st.id} className="flex items-center gap-2 py-1">
                        <input
                          value={st.name}
                          onChange={(x) =>
                            edit((c) => {
                              const found = c.students.find((y) => y.id === st.id)
                              if (found) found.name = x.target.value
                            })
                          }
                          className="flex-1 rounded-lg px-2 py-1 text-sm"
                          style={{ border: `1px solid ${C.line}`, background: '#fff' }}
                        />
                        <button
                          className="text-xs font-bold"
                          style={{ color: C.red }}
                          onClick={() =>
                            edit((c) => {
                              c.students = c.students.filter((y) => y.id !== st.id)
                            })
                          }
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
                    <div className="mb-2 flex items-center gap-2">
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
                    </div>
                    {(() => {
                      const stu = cls.students[Math.min(sessionStudentIdx, cls.students.length - 1)]
                      const r = getRubric(cls.level)
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
                                const t = sessionScore(ss.entry, r)
                                const attendLabel: Record<string, string> = {
                                  present: 'Có mặt', late: 'Muộn', excused: 'Phép', absent: 'Vắng',
                                }
                                return (
                                  <tr key={ss.id} style={{ borderTop: `1px solid ${C.line}` }}>
                                    <td className="py-2 px-3 font-bold">B{ss.no}</td>
                                    <td className="py-2 px-3">
                                      <input
                                        type="date"
                                        value={ss.date}
                                        onChange={(x) => {
                                          const newDate = x.target.value
                                          edit((c) => {
                                            const s = c.students.find((y) => y.id === stu.id)
                                            const found = s?.sessions.find((y) => y.id === ss.id)
                                            if (found) found.date = newDate
                                          })
                                          if (isMongoid(ss.id)) {
                                            sessionService
                                              .update(ss.id, { scheduledAt: `${newDate}T00:00:00.000Z` })
                                              .catch(() => toast.error(`Lỗi khi lưu ngày mới của Buổi ${ss.no} lên server. Thử lại.`, { persist: true }))
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
                                        onClick={async () => {
                                          if (!confirm(`Xóa buổi ${ss.no} (${viDate(ss.date)}) của ${stu.name}? Điểm buổi này sẽ mất.`)) return
                                          if (isMongoid(ss.id)) {
                                            try {
                                              await sessionService.remove(ss.id)
                                            } catch {
                                              toast.error(`Lỗi khi xóa Buổi ${ss.no} trên server. Thử lại.`, { persist: true })
                                              return
                                            }
                                          }
                                          toast.success(`Đã xóa Buổi ${ss.no} của ${stu.name}`)
                                          edit((c) => {
                                            const s = c.students.find((y) => y.id === stu.id)
                                            if (!s) return
                                            s.sessions = s.sessions.filter((y) => y.id !== ss.id)
                                            s.sessions.forEach((y, idx) => { y.no = idx + 1 })
                                          })
                                        }}
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
