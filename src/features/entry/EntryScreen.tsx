import { useState, useEffect } from 'react'
import type { ClassData, SessionEntry } from '@/types'
import { C } from '@/constants/colors'
import { ATTEND } from '@/constants/tags'
import { getClassRubric } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { todayISO, viDate, sessionLabel } from '@/utils/format'
import { sessionScore } from '@/business/scoring'
import { emptyEntry } from '@/business/seed'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { Pick } from '@/components/atoms/Pick'
import { CompEditor } from '@/components/molecules/CompEditor'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { isMongoid } from '@/utils/mongoid'
import { logActivity } from '@/services/activity'

interface EntryScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
}

const cloneEntry = (e: SessionEntry): SessionEntry =>
  JSON.parse(JSON.stringify(e)) as SessionEntry

export function EntryScreen({ cls, update }: EntryScreenProps) {
  const r = getClassRubric(cls)
  const [idx, setIdx] = useState(Math.max(0, cls.sessions.length - 1))
  const [cur, setCur] = useState(0)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [adding, setAdding] = useState(false)

  // Group selection state
  const [groupMode, setGroupMode] = useState(false)
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set())
  const [groupMsg, setGroupMsg] = useState('')

  const session = cls.sessions[idx]

  const showReminder =
    cls.sessions.length > 0 && cls.sessions.length % cls.perMonth === 0

  function syncScore(studentId: string, entry: SessionEntry) {
    if (!isMongoid(cls.id) || !session || !isMongoid(session.id) || !isMongoid(studentId)) return
    const total = sessionScore(entry, r2) ?? 0
    setSyncStatus('saving')
    scoreService
      .upsert({ classId: cls.id, sessionId: session.id, studentId, ...entry, total })
      .then(() => {
        setSyncStatus('saved')
        setTimeout(() => setSyncStatus('idle'), 2000)
      })
      .catch(() => setSyncStatus('error'))
  }

  useEffect(() => {
    if (idx > cls.sessions.length - 1) setIdx(Math.max(0, cls.sessions.length - 1))
  }, [cls.sessions.length, idx])

  async function addSession() {
    if (adding) return
    setAdding(true)
    const localId = uid()
    const newNo = cls.sessions.length + 1
    const entries: Record<string, SessionEntry> = {}
    cls.students.forEach((s) => (entries[s.id] = emptyEntry()))

    update((c) => {
      c.sessions.push({ id: localId, no: newNo, date: todayISO(), homework: '', entries })
    })
    logActivity('session.create', { className: cls.name, sessionNo: newNo }, 'ClassSession')
    setIdx(cls.sessions.length)
    setCur(0)

    if (isMongoid(cls.id)) {
      try {
        const apiSession = await sessionService.create({
          classId: cls.id,
          title: `Buổi ${newNo}`,
          lessonNo: newNo,
          scheduledAt: new Date().toISOString(),
        })
        update((c: ClassData) => {
          const s = c.sessions.find((ss) => ss.id === localId)
          if (s) s.id = apiSession._id
        })
      } catch {
        // silently fail — local session still works
      }
    }
    setAdding(false)
  }

  if (!session)
    return (
      <Card className="p-6 text-center">
        <div className="mb-3 text-sm" style={{ color: C.muted }}>
          Lớp chưa có buổi học nào.
        </div>
        <Btn kind="solid" onClick={addSession} disabled={adding}>
          + Tạo buổi học đầu tiên
        </Btn>
      </Card>
    )

  const st = cls.students[cur]
  const e = (st && session.entries[st.id]) || emptyEntry()
  const FIELDS = ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev'] as const

  const mut = (fn: (en: SessionEntry) => void) =>
    update((c) => {
      const en = (c.sessions[idx].entries[st.id] = c.sessions[idx].entries[st.id] ?? emptyEntry())
      FIELDS.forEach((k) => {
        if (!en[k]) (en as unknown as Record<string, unknown>)[k] = {}
      })
      fn(en)
    })

  // Session-level overrides (comp max + ratio totals)
  const sessionMaxes = session?.maxes ?? {}
  const effectiveComps = r.comps.map((c) =>
    sessionMaxes[c.key] != null ? { ...c, max: sessionMaxes[c.key] } : c,
  )
  const r2 = { ...r, comps: effectiveComps }

  function setSessionMax(key: string, val: number) {
    if (!val || val < 1) return
    update((c) => {
      const s = c.sessions[idx]
      if (!s.maxes) s.maxes = {}
      s.maxes[key] = val
    })
  }

  const ratioTotals: Record<string, number> = {}
  r2.comps.forEach((comp) => {
    comp.evidence?.forEach((ev) => {
      if (ev.type === 'ratio') {
        const k = comp.key + '__' + ev.key
        if (sessionMaxes[k] != null) ratioTotals[k] = sessionMaxes[k]
      }
    })
  })

  function presetClass() {
    update((c) => {
      cls.students.forEach((s) => {
        const en = (c.sessions[idx].entries[s.id] = c.sessions[idx].entries[s.id] ?? emptyEntry())
        FIELDS.forEach((k) => {
          if (!en[k]) (en as unknown as Record<string, unknown>)[k] = {}
        })
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
    const srcEntry = session.entries[st.id] ?? emptyEntry()
    const count = groupSelected.size
    update((c) => {
      groupSelected.forEach((sid) => {
        c.sessions[idx].entries[sid] = cloneEntry(srcEntry)
      })
    })
    setGroupSelected(new Set())
    setGroupMode(false)
    setGroupMsg(`✓ Đã áp dụng điểm của "${st.name}" cho ${count} học sinh`)
    setTimeout(() => setGroupMsg(''), 3500)
  }
  // ──────────────────────────────────────────────────────────────────────────

  const total = sessionScore(e, r2)
  const done = cls.students.filter((s) => sessionScore(session.entries[s.id], r2) !== null).length

  return (
    <div className="space-y-3">
      {showReminder && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: C.gold + '22', color: '#7A5A05', border: `1px solid ${C.gold}55` }}
        >
          ⏰ Đã đủ <b>{cls.sessions.length}</b> buổi học! Nhớ vào <b>Báo cáo</b> để gửi nhận xét cho phụ huynh.
        </div>
      )}

      <Card className="p-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={idx}
            onChange={(x) => { setIdx(Number(x.target.value)); setCur(0) }}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {cls.sessions.map((s, i) => (
              <option key={s.id} value={i}>
                {sessionLabel(s.no, cls.perMonth)} — {viDate(s.date)}{isMongoid(s.id) ? ' ☁' : ''}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={session.date}
            onChange={(x) => update((c) => { c.sessions[idx].date = x.target.value })}
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <Btn kind="solid" onClick={addSession} disabled={adding}>
            {adding ? '...' : '+ Buổi mới'}
          </Btn>
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
          <div className="ml-auto flex items-center gap-3 text-sm" style={{ color: C.muted }}>
            {syncStatus === 'saving' && <span style={{ color: C.board2 }}>☁ Đang lưu...</span>}
            {syncStatus === 'saved' && <span style={{ color: '#059669' }}>☁ Đã lưu</span>}
            {syncStatus === 'error' && <span style={{ color: C.red }}>⚠ Lỗi lưu</span>}
            <span>Đã nhập <b style={{ color: C.ink }}>{done}</b>/{cls.students.length}</span>
          </div>
        </div>

        {/* Homework */}
        <div className="mt-2">
          <input
            value={session.homework ?? ''}
            onChange={(x) => update((c) => { c.sessions[idx].homework = x.target.value })}
            placeholder="Bài tập về nhà cả lớp (bỏ trống nếu không có)"
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </div>

        {/* Session-level question count settings */}
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 text-xs" style={{ background: C.paper }}>
          <span className="font-bold shrink-0" style={{ color: C.muted }}>Số câu:</span>
          {r2.comps.filter((c) => c.type === 'score').map((comp) => (
            <label key={comp.key} className="flex items-center gap-1">
              <span style={{ color: C.muted }}>{comp.label}</span>
              <input
                type="number"
                min="1"
                value={sessionMaxes[comp.key] ?? comp.max}
                onFocus={(x) => x.target.select()}
                onChange={(x) => setSessionMax(comp.key, Number(x.target.value))}
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
                const k = comp.key + '__' + ev.key
                return (
                  <label key={k} className="flex items-center gap-1">
                    <span style={{ color: C.muted }}>BTVN</span>
                    <input
                      type="number"
                      min="1"
                      value={sessionMaxes[k] ?? 20}
                      onFocus={(x) => x.target.select()}
                      onChange={(x) => setSessionMax(k, Number(x.target.value))}
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
            const t = sessionScore(session.entries[s.id], r2)
            const active = i === cur
            const inGroup = groupSelected.has(s.id)
            const missing = t === null && session.entries[s.id]?.attendance !== 'excused'

            return (
              <button
                key={s.id}
                onClick={() => {
                  if (groupMode) {
                    toggleStudentSelection(s.id)
                  } else {
                    if (st) syncScore(st.id, e)
                    setCur(i)
                  }
                }}
                className="relative rounded-lg px-2 py-1 text-xs font-semibold"
                style={{
                  background: active
                    ? C.board
                    : inGroup
                    ? '#10B98122'
                    : t !== null
                    ? C.board2 + '1A'
                    : '#fff',
                  color: active
                    ? '#fff'
                    : inGroup
                    ? '#059669'
                    : t !== null
                    ? C.board2
                    : C.muted,
                  border: `1px solid ${active ? C.board : inGroup ? '#10B981' : C.line}`,
                  outline: active && groupMode ? `2px solid #10B981` : undefined,
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
            style={{ background: groupMode ? '#10B981' : C.board, color: '#fff', borderRadius: '14px 14px 0 0' }}
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
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {total === null ? '—' : total}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
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
                <CompEditor key={comp.key} comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} />
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
              value={e.note}
              onChange={(x) => mut((en) => { en.note = x.target.value })}
              placeholder="Ghi chú riêng cho học sinh này (không bắt buộc)"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            <div className="flex gap-2">
              <Btn
                onClick={() => {
                  syncScore(st.id, e)
                  logActivity('score.entry', { className: cls.name, sessionNo: session.no, studentName: st.name }, 'Score')
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
                  className="flex-1"
                  onClick={() => {
                    syncScore(st.id, e)
                    logActivity('score.entry', { className: cls.name, sessionNo: session.no, studentName: st.name }, 'Score')
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
