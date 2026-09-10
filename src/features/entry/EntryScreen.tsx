import { useState } from 'react'
import type { ClassData, Session, SessionEntry } from '@/types'
import { C, scoreColor } from '@/constants/colors'
import { ATTEND } from '@/constants/tags'
import { getClassRubric } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { todayISO, viDate } from '@/utils/format'
import { sessionScore, rescaleComp } from '@/business/scoring'
import { emptyEntry } from '@/business/seed'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { Pick } from '@/components/atoms/Pick'
import { ProgressBar } from '@/components/atoms/ProgressBar'
import { CompEditor } from '@/components/molecules/CompEditor'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { isMongoid } from '@/utils/mongoid'
import { logActivity } from '@/services/activity'

interface EntryScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
  teacherName?: string
}

const FIELDS = ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev'] as const

const cloneEntry = (e: SessionEntry): SessionEntry =>
  JSON.parse(JSON.stringify(e)) as SessionEntry

/** Tìm buổi số N của đúng học sinh này; nếu chưa có thì tạo mới với ngày
 *  `dateForNew` (chỉ ở local — đẩy lên server xảy ra khi lưu điểm, xem
 *  syncScore). Buổi số là do giáo viên CHỌN, không tự tăng theo thứ tự
 *  nhập — vì học sinh có thể vào học trễ/sớm hơn ngày chung của lớp, hoặc
 *  giáo viên cần nhập bù 1 buổi cũ theo đúng số buổi của nó. */
function findOrCreateSession(c: ClassData, studentId: string, no: number, dateForNew: string, teacherName?: string): Session {
  const student = c.students.find((s) => s.id === studentId)!
  let session = student.sessions.find((s) => s.no === no)
  if (!session) {
    session = {
      id: uid(), no, date: dateForNew, homework: '', entry: emptyEntry(),
      createdByName: teacherName, recordedAt: new Date().toISOString(),
    }
    student.sessions.push(session)
    student.sessions.sort((a, b) => a.no - b.no)
  }
  return session
}

export function EntryScreen({ cls, update, teacherName }: EntryScreenProps) {
  const r = getClassRubric(cls)
  const [selectedNo, setSelectedNo] = useState(1)
  const [draftDate, setDraftDate] = useState(todayISO())
  const [cur, setCur] = useState(0)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, total: 0 })
  const [showSummary, setShowSummary] = useState(false)

  // Group selection state
  const [groupMode, setGroupMode] = useState(false)
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set())
  const [groupMsg, setGroupMsg] = useState('')

  // "Số câu" — bản nháp đang gõ, tách khỏi giá trị đã lưu để không bị nhảy
  // số cũ trở lại mỗi khi xóa hết ô để gõ số mới (input là controlled).
  const [maxDrafts, setMaxDrafts] = useState<Record<string, string>>({})

  const st = cls.students[cur]
  const session = st?.sessions.find((s) => s.no === selectedNo)
  const effectiveDate = session?.date ?? draftDate
  const e = session?.entry ?? emptyEntry()

  function handleDateChange(newDate: string) {
    if (session) {
      update((c) => {
        const stu = c.students.find((s) => s.id === st?.id)
        const ss = stu?.sessions.find((y) => y.id === session.id)
        if (ss) ss.date = newDate
      })
      if (isMongoid(session.id)) {
        sessionService.update(session.id, { scheduledAt: `${newDate}T00:00:00.000Z` }).catch(() => {})
      }
    } else {
      setDraftDate(newDate)
    }
  }

  const maxNo = Math.max(
    cls.perMonth,
    selectedNo,
    ...cls.students.flatMap((s) => s.sessions.map((ss) => ss.no)),
  )

  // Session-level overrides (comp max + ratio totals) — áp dụng cho ngày đang chọn
  const sessionMaxes = session?.maxes ?? {}
  const effectiveComps = r.comps.map((c) =>
    sessionMaxes[c.key] != null ? rescaleComp(c, sessionMaxes[c.key]) : c,
  )
  const r2 = { ...r, comps: effectiveComps }

  async function syncScore(studentId: string) {
    if (!isMongoid(cls.id) || !isMongoid(studentId)) return
    const student = cls.students.find((s) => s.id === studentId)
    const target = student?.sessions.find((s) => s.no === selectedNo)
    if (!student || !target) return // chưa nhập gì cho học sinh này buổi này — không có gì để lưu
    const maxes = target.maxes ?? {}
    const comps = r.comps.map((c) => (maxes[c.key] != null ? rescaleComp(c, maxes[c.key]) : c))
    const total = sessionScore(target.entry, { ...r, comps }) ?? 0
    setSyncStatus('saving')
    try {
      let sessionId = target.id
      if (!isMongoid(sessionId)) {
        const apiSession = await sessionService.create({
          classId: cls.id,
          studentId,
          title: `Buổi ${target.no}`,
          lessonNo: target.no,
          scheduledAt: `${target.date}T00:00:00.000Z`,
        })
        sessionId = apiSession._id
        update((c) => {
          const stu = c.students.find((s) => s.id === studentId)
          const ss = stu?.sessions.find((s) => s.no === selectedNo)
          if (ss) ss.id = sessionId
        })
        logActivity('session.create', { className: cls.name, sessionNo: target.no, studentName: student.name }, 'ClassSession')
      }
      await scoreService.upsert({ classId: cls.id, sessionId, studentId, ...target.entry, total })
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
    }
  }

  // Gom điểm đã nhập trước đây (còn kẹt trên máy này, chưa từng lên được
  // server do lỗi kiểu dữ liệu đã sửa) và đẩy lên server, 1 lần.
  async function backfillAllScores() {
    if (backfilling) return
    const jobs: Array<{ sessionId: string; studentId: string; entry: SessionEntry; total: number }> = []
    cls.students.forEach((stu) => {
      if (!isMongoid(stu.id)) return
      stu.sessions.forEach((s) => {
        if (!isMongoid(s.id)) return
        const maxes = s.maxes ?? {}
        const comps = r.comps.map((c) => (maxes[c.key] != null ? rescaleComp(c, maxes[c.key]) : c))
        const total = sessionScore(s.entry, { ...r, comps })
        if (total === null) return
        jobs.push({ sessionId: s.id, studentId: stu.id, entry: s.entry, total })
      })
    })
    if (!jobs.length) {
      alert('Không có điểm nào cần đồng bộ — mọi thứ đã lên server rồi.')
      return
    }
    if (!confirm(`Đồng bộ ${jobs.length} điểm đã nhập trước đây lên server?`)) return
    setBackfilling(true)
    setBackfillProgress({ done: 0, total: jobs.length })
    let okCount = 0
    let failCount = 0
    for (const job of jobs) {
      try {
        await scoreService.upsert({
          classId: cls.id, sessionId: job.sessionId, studentId: job.studentId,
          ...job.entry, total: job.total,
        })
        okCount++
      } catch {
        failCount++
      }
      setBackfillProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setBackfilling(false)
    alert(`Đồng bộ xong: ${okCount} điểm thành công${failCount ? `, ${failCount} lỗi (thử lại sau)` : ''}.`)
  }

  if (!cls.students.length)
    return (
      <Card className="p-6 text-center">
        <div className="text-sm" style={{ color: C.muted }}>
          Lớp chưa có học sinh nào. Vào tab <b>Lớp học</b> để thêm học sinh.
        </div>
      </Card>
    )

  const mut = (fn: (en: SessionEntry) => void) =>
    update((c) => {
      if (!st) return
      const ss = findOrCreateSession(c, st.id, selectedNo, effectiveDate, teacherName)
      FIELDS.forEach((k) => {
        if (!ss.entry[k]) (ss.entry as unknown as Record<string, unknown>)[k] = {}
      })
      fn(ss.entry)
    })

  function setHomework(v: string) {
    update((c) => {
      if (!st) return
      findOrCreateSession(c, st.id, selectedNo, effectiveDate, teacherName).homework = v
    })
  }

  function setSessionMax(key: string, val: number) {
    if (!val || val < 1) return
    // Áp dụng cho cả lớp ở buổi số này — giáo viên chỉ cần đặt 1 lần mỗi buổi.
    update((c) => {
      c.students.forEach((s) => {
        const ss = findOrCreateSession(c, s.id, selectedNo, effectiveDate, teacherName)
        ss.maxes = ss.maxes ?? {}
        ss.maxes[key] = val
      })
    })
  }

  function commitSessionMax(key: string, raw: string) {
    const val = Number(raw)
    if (raw.trim() && val >= 1) setSessionMax(key, val)
    // Luôn xóa draft sau khi rời ô — input quay về đọc giá trị thật (đã lưu, hoặc mặc định nếu gõ rỗng/không hợp lệ)
    setMaxDrafts((d) => {
      const next = { ...d }
      delete next[key]
      return next
    })
  }

  // Tổng câu của tiêu chí (VD "Bài tập về nhà") dùng luôn làm mẫu số mặc định
  // cho ô "Kết quả: đúng X/Y câu" — sửa 1 trong 2 chỗ đều ra cùng 1 số.
  const ratioTotals: Record<string, number> = {}
  r2.comps.forEach((comp) => {
    comp.evidence?.forEach((ev) => {
      if (ev.type === 'ratio' && sessionMaxes[comp.key] != null) {
        ratioTotals[comp.key + '__' + ev.key] = sessionMaxes[comp.key]
      }
    })
  })

  function presetClass() {
    update((c) => {
      c.students.forEach((s) => {
        const ss = findOrCreateSession(c, s.id, selectedNo, effectiveDate, teacherName)
        FIELDS.forEach((k) => {
          if (!ss.entry[k]) (ss.entry as unknown as Record<string, unknown>)[k] = {}
        })
        const en = ss.entry
        en.attendance = 'present'
        r2.comps.forEach((comp) => {
          if (comp.type === 'parts') {
            const m: Record<string, number> = {}
            ;(comp.parts ?? []).forEach((p) => (m[p.id] = p.max))
            en.parts[comp.key] = m
          } else if (comp.type === 'choice') {
            en.choice[comp.key] = (comp.options ?? [])[0]?.id ?? ''
          } else if (comp.type === 'ticks') {
            en.ticks[comp.key] = (comp.items ?? []).map((t) => t.id)
          } else if (comp.type === 'score') {
            en.scores[comp.key] = comp.max
          }
        })
      })
    })
  }

  // ── Group selection logic ──────────────────────────────────────────────────
  function toggleGroupMode() {
    setGroupMode((g) => !g)
    setGroupSelected(new Set())
    setGroupMsg('')
  }

  function toggleStudentSelection(sid: string) {
    setGroupSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  function selectAll() {
    setGroupSelected(new Set(cls.students.map((s) => s.id)))
  }

  function clearSelection() {
    setGroupSelected(new Set())
  }

  function applyGroupScores() {
    if (!st || groupSelected.size === 0) return
    const srcEntry = e
    const count = groupSelected.size
    update((c) => {
      groupSelected.forEach((sid) => {
        findOrCreateSession(c, sid, selectedNo, effectiveDate, teacherName).entry = cloneEntry(srcEntry)
      })
    })
    setGroupSelected(new Set())
    setGroupMode(false)
    setGroupMsg(`✓ Đã áp dụng điểm của "${st.name}" cho ${count} học sinh`)
    setTimeout(() => setGroupMsg(''), 3500)
  }
  // ──────────────────────────────────────────────────────────────────────────

  const total = sessionScore(e, r2)
  const done = cls.students.filter((s) => {
    const ss = s.sessions.find((x) => x.no === selectedNo)
    return ss ? sessionScore(ss.entry, r2) !== null : false
  }).length

  const studentSessionCount = st?.sessions.length ?? 0
  const showReminder = studentSessionCount > 0 && studentSessionCount % cls.perMonth === 0

  // Xem nhanh kết quả cả lớp cho đúng buổi số này (mỗi em có thể là ngày
  // khác nhau) — không cần xuất Excel
  const daySummary = cls.students.map((s) => {
    const ss = s.sessions.find((x) => x.no === selectedNo)
    const t = ss ? sessionScore(ss.entry, r2) : null
    return { student: s, session: ss, total: t }
  })

  return (
    <div className="space-y-3">
      <Card className="p-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedNo}
            onChange={(x) => { setSelectedNo(Number(x.target.value)); setDraftDate(todayISO()) }}
            title="Chọn số buổi — mỗi học sinh có buổi riêng, có thể khác ngày nhau"
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: C.paper, color: C.board, border: `1px solid ${C.line}` }}
          >
            {Array.from({ length: maxNo }, (_, i) => i + 1).map((no) => {
              const existing = st?.sessions.find((s) => s.no === no)
              return (
                <option key={no} value={no}>
                  Buổi {no} — {existing ? viDate(existing.date) : 'chưa có'}
                </option>
              )
            })}
          </select>
          <input
            type="date"
            value={effectiveDate}
            onChange={(x) => handleDateChange(x.target.value)}
            title="Ngày của buổi đang chọn"
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          />
          {!session && (
            <span className="text-xs" style={{ color: C.muted }}>(chưa lưu)</span>
          )}
          <Btn onClick={presetClass} title="Đặt sẵn mức đạt cho cả lớp">
            ⚡ Mặc định
          </Btn>
          <button
            onClick={toggleGroupMode}
            title="Chọn nhóm học sinh có cùng điểm để áp dụng nhanh"
            className="rounded-xl px-3 py-1.5 text-sm font-semibold"
            style={{
              background: groupMode ? '#10B981' : C.paper,
              color: groupMode ? '#fff' : C.muted,
              border: `1px solid ${groupMode ? '#10B981' : C.line}`,
            }}
          >
            ☑ Chọn nhóm
          </button>
          <button
            onClick={() => setShowSummary((v) => !v)}
            title="Xem điểm cả lớp trong ngày đang chọn, không cần xuất Excel"
            className="rounded-xl px-3 py-1.5 text-sm font-semibold"
            style={{
              background: showSummary ? C.board : C.paper,
              color: showSummary ? '#fff' : C.muted,
              border: `1px solid ${showSummary ? C.board : C.line}`,
            }}
          >
            📋 Xem cả lớp
          </button>
          <button
            onClick={backfillAllScores}
            disabled={backfilling}
            title="Đẩy điểm đã nhập trước đây (còn kẹt trên máy này) lên server"
            className="rounded-xl px-3 py-1.5 text-sm font-semibold"
            style={{ background: C.paper, color: C.muted, border: `1px solid ${C.line}` }}
          >
            {backfilling ? `☁ Đang đồng bộ ${backfillProgress.done}/${backfillProgress.total}...` : '☁ Đồng bộ điểm cũ'}
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm" style={{ color: C.muted }}>
            {syncStatus === 'saving' && <span style={{ color: C.board2 }}>⟳ Đang lưu...</span>}
            {syncStatus === 'saved' && (
              <span className="animate-slide-down" style={{ color: C.emerald }}>✓ Đã lưu</span>
            )}
            {syncStatus === 'error' && <span style={{ color: C.red }}>⚠ Lỗi lưu</span>}
            <span>Đã nhập <b style={{ color: C.ink }}>{done}</b>/{cls.students.length}</span>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={(done / Math.max(1, cls.students.length)) * 100} color={C.emerald} height={6} animated className="flex-1" />
          <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: C.emerald }}>
            {done}/{cls.students.length} · {Math.round((done / Math.max(1, cls.students.length)) * 100)}%
          </span>
        </div>

        {/* Xem nhanh cả lớp cho đúng buổi số này — mỗi em có thể khác ngày */}
        {showSummary && (
          <div className="mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${C.line}` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.paper }}>
                  <th className="py-1.5 px-3 text-left font-semibold" style={{ color: C.muted }}>Học sinh</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Ngày</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Điểm danh</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Tổng điểm</th>
                </tr>
              </thead>
              <tbody>
                {daySummary.map(({ student, session: ss, total: t }, i) => (
                  <tr
                    key={student.id}
                    onClick={() => setCur(i)}
                    className="cursor-pointer"
                    style={{ borderTop: `1px solid ${C.line}`, background: i === cur ? C.board + '0D' : undefined }}
                  >
                    <td className="py-1.5 px-3 font-semibold">{student.name}</td>
                    <td className="py-1.5 px-3 text-center" style={{ color: C.muted }}>
                      {ss ? viDate(ss.date) : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-center" style={{ color: C.muted }}>
                      {ss ? (ATTEND.find((a) => a.key === ss.entry.attendance)?.label ?? '—') : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold" style={{ color: t !== null ? scoreColor(t) : C.muted }}>
                      {t !== null ? t : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Session-level question count settings */}
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-xs" style={{ background: C.paper }}>
          <span className="font-bold shrink-0" style={{ color: C.muted }}>Số câu:</span>
          {r2.comps.filter((c) => c.type === 'score').map((comp) => (
            <label key={comp.key} className="flex items-center gap-1">
              <span style={{ color: C.muted }}>{comp.label}</span>
              <input
                type="text"
                inputMode="numeric"
                value={maxDrafts[comp.key] ?? String(sessionMaxes[comp.key] ?? comp.max)}
                onFocus={(x) => x.target.select()}
                onChange={(x) => setMaxDrafts((d) => ({ ...d, [comp.key]: x.target.value.replace(/\D/g, '') }))}
                onBlur={(x) => commitSessionMax(comp.key, x.target.value)}
                onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur() }}
                className="w-14 rounded-lg px-1 py-0.5 text-center font-bold"
                style={{ border: `1px solid ${C.board}66` }}
              />
              <span style={{ color: C.muted }}>câu</span>
            </label>
          ))}
          {r2.comps.flatMap((comp) =>
            (comp.evidence ?? [])
              .filter((ev) => ev.type === 'ratio')
              .map((ev) => {
                const k = comp.key
                return (
                  <label key={comp.key + '_' + ev.key} className="flex items-center gap-1">
                    <span style={{ color: C.muted }}>{comp.label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={maxDrafts[k] ?? String(sessionMaxes[k] ?? comp.max)}
                      onFocus={(x) => x.target.select()}
                      onChange={(x) => setMaxDrafts((d) => ({ ...d, [k]: x.target.value.replace(/\D/g, '') }))}
                      onBlur={(x) => commitSessionMax(k, x.target.value)}
                      onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur() }}
                      className="w-14 rounded-lg px-1 py-0.5 text-center font-bold"
                      style={{ border: `1px solid ${C.board}66` }}
                    />
                    <span style={{ color: C.muted }}>câu</span>
                  </label>
                )
              }),
          )}
        </div>

        {/* Group mode guide banner */}
        {groupMode && (
          <div
            className="mt-2 rounded-xl px-3 py-2 text-xs"
            style={{ background: '#ECFDF5', border: '1px solid #10B98133', color: '#065F46' }}
          >
            <b>Chế độ chọn nhóm:</b> Bấm vào từng học sinh để chọn → xem điểm của bạn muốn sao chép bên dưới → bấm <b>Áp dụng</b>.
            Dùng nút ← → để chuyển học sinh đang xem.
          </div>
        )}

        {/* Student pills */}
        <div className="mt-2 flex flex-wrap gap-1">
          {cls.students.map((s, i) => {
            const ss = s.sessions.find((x) => x.no === selectedNo)
            const t = ss ? sessionScore(ss.entry, r2) : null
            const active = i === cur
            const inGroup = groupSelected.has(s.id)
            const missing = t === null && ss?.entry.attendance !== 'excused'

            return (
              <button
                key={s.id}
                onClick={() => {
                  if (groupMode) {
                    toggleStudentSelection(s.id)
                  } else {
                    if (st) void syncScore(st.id)
                    setCur(i)
                  }
                }}
                className="relative rounded-lg px-2 py-1 text-xs font-semibold transition-all"
                style={{
                  background: active
                    ? C.board
                    : inGroup
                    ? C.emerald + '33'
                    : t !== null
                    ? C.emerald + '26'
                    : '#fff',
                  color: active
                    ? '#fff'
                    : inGroup
                    ? C.emerald
                    : t !== null
                    ? C.emerald
                    : C.muted,
                  border: `1px solid ${active ? C.board : inGroup ? C.emerald : t !== null ? C.emerald + '4D' : C.line}`,
                  outline: active && groupMode ? `2px solid ${C.emerald}` : undefined,
                }}
              >
                {groupMode && (
                  <span className="mr-0.5">{inGroup ? '✓' : '○'}</span>
                )}
                {s.name}
                {!active && missing && (
                  <span
                    className="absolute -top-1 -right-1 h-2 w-2 rounded-full"
                    style={{ background: '#F59E0B' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Group selection action bar */}
        {groupMode && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={selectAll}
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.muted }}
            >
              Chọn tất cả
            </button>
            <button
              onClick={clearSelection}
              className="rounded-lg px-2 py-1 text-xs font-semibold"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.muted }}
            >
              Bỏ chọn
            </button>
            <span className="text-xs" style={{ color: C.muted }}>
              Đã chọn: <b style={{ color: '#059669' }}>{groupSelected.size}</b> học sinh
            </span>
            {groupSelected.size > 0 && st && (
              <button
                onClick={applyGroupScores}
                className="rounded-xl px-4 py-1.5 text-xs font-bold"
                style={{ background: '#10B981', color: '#fff', marginLeft: 'auto' }}
              >
                Áp dụng điểm của "{st.name}" → {groupSelected.size} học sinh đã chọn
              </button>
            )}
          </div>
        )}

        {/* Group success message */}
        {groupMsg && (
          <div
            className="mt-1 rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ background: '#ECFDF5', color: '#065F46' }}
          >
            {groupMsg}
          </div>
        )}
      </Card>

      {st && (
        <Card>
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{
              background: groupMode ? C.emerald : e.attendance === 'absent' ? C.rose : C.board,
              color: '#fff',
              borderRadius: '14px 14px 0 0',
            }}
          >
            <div>
              <div className="text-xs opacity-70">
                {groupMode
                  ? `Chế độ nhóm · Điểm mẫu để áp dụng`
                  : `Phiếu đánh giá ${r.label} · học sinh ${cur + 1}/${cls.students.length}`}
              </div>
              <div className="text-xl font-black">{st.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-70">Tổng buổi này</div>
              <div
                className="text-3xl font-black"
                style={{ fontVariantNumeric: 'tabular-nums', color: total === null ? '#fff' : scoreColor(total) }}
              >
                {total === null ? '—' : total}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {showReminder && (
              <div
                className="rounded-xl px-4 py-2.5 text-sm font-semibold"
                style={{ background: C.gold + '22', color: '#7A5A05', border: `1px solid ${C.gold}55` }}
              >
                ⏰ {st.name} đã đủ <b>{studentSessionCount}</b> buổi học! Nhớ vào <b>Báo cáo</b> để gửi nhận xét cho phụ huynh.
              </div>
            )}

            <div>
              <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>
                Chuyên cần{' '}
                {r.attendance.mode === 'deduct'
                  ? '(đi học đúng giờ 10 điểm · muộn −2 · nghỉ phép −3 · nghỉ KP −5 mỗi lần)'
                  : '(10 điểm)'}
              </div>
              <div className="flex flex-wrap gap-2">
                {ATTEND.map((a) => (
                  <Pick
                    key={a.key}
                    tone={a.deduct === 0 ? 'good' : 'bad'}
                    on={e.attendance === a.key}
                    onClick={() => mut((en) => { en.attendance = a.key })}
                  >
                    {a.label}{' '}
                    {r.attendance.mode === 'deduct' ? (
                      <span className="opacity-60">
                        {a.deduct ? `−${a.deduct}` : `${r.attendance.base ?? 10}đ`}
                      </span>
                    ) : (
                      <span className="opacity-60">{a.pts}đ</span>
                    )}
                  </Pick>
                ))}
              </div>
            </div>

            {e.attendance === 'excused' ? (
              <div className="rounded-xl p-3 text-sm" style={{ background: C.paper, color: C.muted }}>
                Buổi nghỉ phép — không tính vào điểm trung bình, chỉ trừ điểm chuyên cần.
              </div>
            ) : (
              r2.comps.map((comp) => (
                <CompEditor
                  key={comp.key}
                  comp={comp}
                  e={e}
                  mut={mut}
                  ratioTotals={ratioTotals}
                  maxDraft={maxDrafts[comp.key]}
                  onMaxInput={(raw) => setMaxDrafts((d) => ({ ...d, [comp.key]: raw }))}
                  onMaxCommit={(raw) => commitSessionMax(comp.key, raw)}
                />
              ))
            )}

            {/* Study hours */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted }}>
                  Giờ ở lại học thêm
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="5" step="0.5"
                    value={e.stayHours ?? ''}
                    onFocus={(x) => x.target.select()}
                    onChange={(x) =>
                      mut((en) => { en.stayHours = x.target.value === '' ? undefined : Number(x.target.value) })
                    }
                    className="w-20 rounded-xl px-3 py-2 text-center font-bold"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <span className="text-xs" style={{ color: C.muted }}>giờ</span>
                </div>
              </label>
              <label className="text-sm">
                <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted }}>
                  Giờ tự học ở nhà
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="10" step="0.5"
                    value={e.homeHours ?? ''}
                    onFocus={(x) => x.target.select()}
                    onChange={(x) =>
                      mut((en) => { en.homeHours = x.target.value === '' ? undefined : Number(x.target.value) })
                    }
                    className="w-20 rounded-xl px-3 py-2 text-center font-bold"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <span className="text-xs" style={{ color: C.muted }}>giờ</span>
                </div>
              </label>
            </div>

            <input
              value={session?.homework ?? ''}
              onChange={(x) => setHomework(x.target.value)}
              placeholder="Bài tập về nhà riêng cho học sinh này (bỏ trống nếu không có)"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            <input
              value={e.note}
              onChange={(x) => mut((en) => { en.note = x.target.value })}
              placeholder="Ghi chú riêng cho học sinh này (không bắt buộc)"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            <div className="flex gap-2">
              <Btn
                onClick={() => {
                  void syncScore(st.id)
                  logActivity('score.entry', { className: cls.name, sessionNo: session?.no ?? 0, studentName: st.name }, 'Score')
                  setCur(Math.max(0, cur - 1))
                }}
              >
                ← Trước
              </Btn>
              {groupMode && groupSelected.size > 0 ? (
                <button
                  onClick={applyGroupScores}
                  className="flex-1 rounded-xl py-2 text-sm font-bold"
                  style={{ background: '#10B981', color: '#fff' }}
                >
                  ✓ Áp dụng cho {groupSelected.size} học sinh đã chọn
                </button>
              ) : (
                <Btn
                  kind="gold"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    void syncScore(st.id)
                    logActivity('score.entry', { className: cls.name, sessionNo: session?.no ?? 0, studentName: st.name }, 'Score')
                    setCur(Math.min(cls.students.length - 1, cur + 1))
                  }}
                >
                  Học sinh tiếp theo →
                </Btn>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
