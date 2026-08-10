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

export function EntryScreen({ cls, update }: EntryScreenProps) {
  const r = getClassRubric(cls)
  const [idx, setIdx] = useState(Math.max(0, cls.sessions.length - 1))
  const [cur, setCur] = useState(0)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [adding, setAdding] = useState(false)
  const session = cls.sessions[idx]

  // Reminder: reached 8 or 12 sessions (or multiples thereof)
  const showReminder =
    cls.sessions.length > 0 && cls.sessions.length % cls.perMonth === 0

  function syncScore(studentId: string, entry: SessionEntry) {
    if (!isMongoid(cls.id) || !session || !isMongoid(session.id) || !isMongoid(studentId)) return
    const total = sessionScore(entry, r) ?? 0
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

  function presetClass() {
    update((c) => {
      cls.students.forEach((s) => {
        const en = (c.sessions[idx].entries[s.id] = c.sessions[idx].entries[s.id] ?? emptyEntry())
        FIELDS.forEach((k) => {
          if (!en[k]) (en as unknown as Record<string, unknown>)[k] = {}
        })
        en.attendance = 'present'
        r.comps.forEach((comp) => {
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

  const total = sessionScore(e, r)
  const done = cls.students.filter((s) => sessionScore(session.entries[s.id], r) !== null).length

  return (
    <div className="space-y-3">
      {/* Reminder banner when reaching perMonth sessions */}
      {showReminder && (
        <div
          className="rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={{ background: C.gold + '22', color: '#7A5A05', border: `1px solid ${C.gold}55` }}
        >
          ⏰ Đã đủ <b>{cls.sessions.length}</b> buổi học! Nhớ vào <b>Báo cáo</b> để gửi nhận xét cho phụ huynh.
        </div>
      )}

      <Card className="p-3">
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
            onChange={(x) =>
              update((c) => { c.sessions[idx].date = x.target.value })
            }
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <Btn kind="solid" onClick={addSession} disabled={adding}>
            {adding ? '...' : '+ Buổi mới'}
          </Btn>
          <Btn onClick={presetClass} title="Đặt sẵn mức đạt cho cả lớp, sau đó chỉ sửa ngoại lệ">
            ⚡ Mặc định cả lớp
          </Btn>
          <div className="ml-auto flex items-center gap-3 text-sm" style={{ color: C.muted }}>
            {syncStatus === 'saving' && <span style={{ color: C.board2 }}>☁ Đang lưu...</span>}
            {syncStatus === 'saved' && <span style={{ color: '#059669' }}>☁ Đã lưu</span>}
            {syncStatus === 'error' && <span style={{ color: C.red }}>⚠ Lỗi lưu</span>}
            <span>Đã nhập <b style={{ color: C.ink }}>{done}</b>/{cls.students.length}</span>
          </div>
        </div>

        {/* Homework field for the whole class */}
        <div className="mt-2">
          <input
            value={session.homework ?? ''}
            onChange={(x) =>
              update((c) => { c.sessions[idx].homework = x.target.value })
            }
            placeholder="Bài tập về nhà cả lớp (bỏ trống nếu không có)"
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </div>

        {/* Student pills with missing-data indicator */}
        <div className="mt-2 flex flex-wrap gap-1">
          {cls.students.map((s, i) => {
            const t = sessionScore(session.entries[s.id], r)
            const active = i === cur
            const missing = t === null && session.entries[s.id]?.attendance !== 'excused'
            return (
              <button
                key={s.id}
                onClick={() => { if (st) syncScore(st.id, e); setCur(i) }}
                className="relative rounded-lg px-2 py-1 text-xs font-semibold"
                style={{
                  background: active ? C.board : t !== null ? C.board2 + '1A' : '#fff',
                  color: active ? '#fff' : t !== null ? C.board2 : C.muted,
                  border: `1px solid ${active ? C.board : C.line}`,
                }}
              >
                {s.name}
                {/* Orange dot for students not yet entered */}
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
      </Card>

      {st && (
        <Card>
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: C.board, color: '#fff', borderRadius: '14px 14px 0 0' }}
          >
            <div>
              <div className="text-xs opacity-70">
                Phiếu đánh giá {r.label} · học sinh {cur + 1}/{cls.students.length}
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
                    onClick={() =>
                      mut((en) => { en.attendance = a.key })
                    }
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
              r.comps.map((comp) => <CompEditor key={comp.key} comp={comp} e={e} mut={mut} />)
            )}

            {/* Study hours */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted }}>
                  Giờ ở lại học thêm
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.5"
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
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
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
              onChange={(x) =>
                mut((en) => { en.note = x.target.value })
              }
              placeholder="Ghi chú riêng cho học sinh này (không bắt buộc)"
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />
            <div className="flex gap-2">
              <Btn onClick={() => { syncScore(st.id, e); logActivity('score.entry', { className: cls.name, sessionNo: session.no, studentName: st.name }, 'Score'); setCur(Math.max(0, cur - 1)) }}>
                ← Trước
              </Btn>
              <Btn
                kind="gold"
                className="flex-1"
                onClick={() => { syncScore(st.id, e); logActivity('score.entry', { className: cls.name, sessionNo: session.no, studentName: st.name }, 'Score'); setCur(Math.min(cls.students.length - 1, cur + 1)) }}
              >
                Học sinh tiếp theo →
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
