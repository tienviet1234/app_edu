import { useState, useMemo, useRef } from 'react'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { RUBRICS, getRubric } from '@/constants/rubrics'
import { sessionScore } from '@/business/scoring'
import { uid } from '@/utils/uid'
import { round1, viDate } from '@/utils/format'
import { rankingOf } from '@/business/ranking'
import { emptyEntry } from '@/business/seed'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { classService } from '@/services/classes'
import { importStudentNames, exportAttendance } from '@/utils/excel'
import { useClassStudents } from '@/hooks'
import { useAuthStore } from '@/store/authStore'
import { isMongoid } from '@/utils/mongoid'

function autoLevel(name: string): 'primary' | 'secondary' {
  const m = String(name).match(/\d+/)
  const g = m ? Number(m[0]) : 0
  return g >= 1 && g <= 5 ? 'primary' : 'secondary'
}

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
          .map((n) => ({ id: uid(), name: n })),
        sessions: [],
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
  const [importError, setImportError] = useState('')
  const xlsxRef = useRef<HTMLInputElement>(null)
  const { user } = useAuthStore()
  const cls = data.classes[current]
  const edit = (fn: (c: ClassData) => void) => setData(produce((d) => fn(d.classes[current])))
  const preview = useMemo(() => parseBulk(bulk), [bulk])

  const { data: apiStudents } = useClassStudents(cls && isMongoid(cls.id) ? cls.id : '')

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
          const due =
            c.sessions.length > 0 &&
            (c.perMonth === 8 ? c.sessions.length % 8 === 0 : c.sessions.length % 6 === 0)
          return (
            <Card
              key={c.id}
              className="cursor-pointer p-4"
              style={{ borderColor: i === current ? C.board : C.line, borderWidth: i === current ? 2 : 1 }}
            >
              <div onClick={() => setCurrent(i)}>
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
                      Buổi {c.sessions.length}/{c.perMonth}
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
                    sessions: [],
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
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Giáo viên</div>
              <input
                value={cls.teacher}
                onChange={(x) => edit((c) => { c.teacher = x.target.value })}
                className="mt-1 w-full rounded-xl px-3 py-2"
                style={{ border: `1px solid ${C.line}` }}
              />
            </label>
            <label className="text-sm">
              <div style={{ color: C.muted }}>Phiếu đánh giá</div>
              <select
                value={cls.level}
                onChange={(x) =>
                  edit((c) => {
                    c.level = x.target.value as 'primary' | 'secondary'
                    c.perMonth = x.target.value === 'primary' ? 8 : 12
                  })
                }
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
                  {t === 'students' ? `Học sinh (${cls.students.length})` : `Buổi học (${cls.sessions.length})`}
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
                      onClick={() => {
                        const list = names.split('\n').map((x) => x.trim()).filter(Boolean)
                        if (!list.length) return
                        setData(
                          produce((d) => {
                            const c = d.classes[current]
                            list.forEach((n) => {
                              const s = { id: uid(), name: n }
                              c.students.push(s)
                              c.sessions.forEach((ss: { entries: Record<string, ReturnType<typeof emptyEntry>> }) => { ss.entries[s.id] = emptyEntry() })
                            })
                          }),
                        )
                        setNames('')
                      }}
                    >
                      Thêm vào lớp
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
                          setData(
                            produce((d) => {
                              const c = d.classes[current]
                              parsed.forEach((n) => {
                                if (c.students.some((st2: { name: string }) => st2.name === n)) return
                                const s = { id: uid(), name: n }
                                c.students.push(s)
                                c.sessions.forEach((ss: { entries: Record<string, ReturnType<typeof emptyEntry>> }) => { ss.entries[s.id] = emptyEntry() })
                              })
                            }),
                          )
                        } catch {
                          setImportError('Lỗi đọc file. Hãy thử lại với file .xlsx hoặc .csv.')
                        }
                      }}
                    />
                    {importError && <div className="w-full text-xs" style={{ color: C.red }}>{importError}</div>}
                  </div>
                  {cls.sessions.length > 0 && (
                    <Btn kind="ghost" className="mt-2" onClick={() => exportAttendance(cls)}>
                      Xuất điểm danh Excel
                    </Btn>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-sm" style={{ color: C.muted }}>
                    Danh sách ({cls.students.length})
                  </div>
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
                {cls.sessions.length === 0 ? (
                  <div className="rounded-xl p-6 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
                    Chưa có buổi học nào. Vào tab <b>Nhập điểm</b> để thêm buổi đầu tiên.
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: C.paper }}>
                          <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Buổi</th>
                          <th className="py-2 px-3 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
                          <th className="py-2 px-3 text-center font-semibold" style={{ color: C.muted }}>Đi học</th>
                          <th className="py-2 px-3 text-center font-semibold" style={{ color: C.muted }}>TB điểm</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cls.sessions.map((ss) => {
                          const presentCount = cls.students.filter(
                            (st) => ['present', 'late', 'excused'].includes(ss.entries[st.id]?.attendance ?? 'absent'),
                          ).length
                          const r = getRubric(cls.level)
                          const scores = cls.students
                            .map((st) => {
                              const e = ss.entries[st.id]
                              if (!e) return null
                              return sessionScore(e, r) ?? null
                            })
                            .filter((x): x is number => x !== null)
                          const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

                          return (
                            <tr key={ss.id} style={{ borderTop: `1px solid ${C.line}` }}>
                              <td className="py-2 px-3 font-bold">B{ss.no}</td>
                              <td className="py-2 px-3">
                                <input
                                  type="date"
                                  value={ss.date}
                                  onChange={(x) =>
                                    edit((c) => {
                                      const found = c.sessions.find((s) => s.id === ss.id)
                                      if (found) found.date = x.target.value
                                    })
                                  }
                                  className="rounded-lg px-2 py-1 text-sm"
                                  style={{ border: `1px solid ${C.line}` }}
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                {presentCount}/{cls.students.length}
                              </td>
                              <td className="py-2 px-3 text-center font-semibold">
                                {avg !== null ? round1(avg) : '—'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  className="text-xs font-bold"
                                  style={{ color: C.red }}
                                  onClick={() => {
                                    if (!confirm(`Xóa buổi ${ss.no} (${viDate(ss.date)})? Toàn bộ điểm buổi này sẽ mất.`)) return
                                    edit((c) => {
                                      c.sessions = c.sessions.filter((s) => s.id !== ss.id)
                                      c.sessions.forEach((s, idx) => { s.no = idx + 1 })
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
