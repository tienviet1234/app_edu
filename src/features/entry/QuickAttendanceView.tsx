import { useMemo, useRef, useState } from 'react'
import type { AttendanceKey, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { getClassRubric } from '@/constants/rubrics'
import { sessionScore, sessionComps } from '@/business/scoring'
import { attendanceDayOptions, dayAttendanceStats } from '@/business/quickAttendance'
import { weekdayLabel, dm } from '@/business/attendanceOverview'
import { isMongoid } from '@/utils/mongoid'
import { todayISO } from '@/utils/format'
import { useAttendanceWriter } from './useAttendanceWriter'

const BTN: Array<{ k: AttendanceKey; mark: string; label: string; color: string }> = [
  { k: 'present', mark: '✓', label: 'Có mặt', color: C.emerald },
  { k: 'late', mark: 'M', label: 'Đi muộn', color: C.amber },
  { k: 'excused', mark: 'P', label: 'Nghỉ có phép', color: C.blue },
  { k: 'absent', mark: 'V', label: 'Nghỉ không phép', color: C.rose },
]

/** Điểm danh nhanh (đợt 3, 11/11): cả lớp 1 ngày, mỗi em 4 nút ✓ M P V, MỖI LẦN BẤM LÀ LƯU NGAY lên
 *  server (qua `useAttendanceWriter` → `pushSession`). Chưa có buổi ngày đó → tạo buổi (tính học
 *  phí) — "Cả lớp có mặt" hỏi lại nêu đúng số em sẽ có thêm buổi. */
export function QuickAttendanceView({ cls, update, teacherName }: { cls: ClassData; update: (fn: (c: ClassData) => void) => void; teacherName?: string }) {
  const today = todayISO()
  const days = useMemo(() => attendanceDayOptions(cls.students, today), [cls.students, today])
  const [date, setDate] = useState(() => { const t = days.find((d) => d.date === today && d.scheduled); return t ? t.date : (days.filter((d) => d.scheduled).at(-1)?.date ?? today) })
  const w = useAttendanceWriter(cls, update, teacherName)
  const r = getClassRubric(cls)
  const stats = dayAttendanceStats(cls.students, date)
  const askedOffDay = useRef(new Set<string>())
  const [bulk, setBulk] = useState(false)
  const bulkRef = useRef(false) // khóa ngay — 2 cú bấm liền vẫn thấy state `bulk` cũ
  const opt = days.find((d) => d.date === date)
  const savedCount = cls.students.filter((st) => { const s = st.sessions.find((x) => x.date === date); return s && isMongoid(s.id) && !s.dirty }).length
  const marked = cls.students.length - stats.unmarked.length

  /** Ngày không đúng lịch mà cả lớp chưa ai có buổi → hỏi 1 lần "học bù riêng?" (sự cố Lớp 7 24/10,
   *  27/10: nhập nhầm ngày, bị tính tiền). */
  function okForDay(): boolean {
    if (opt?.scheduled || marked > 0 || askedOffDay.current.has(date)) return true
    if (!confirm(`Lớp ${cls.name} không có lịch học ${weekdayLabel(date)} ${dm(date)} và chưa em nào có buổi ngày này. Điểm danh sẽ TẠO buổi mới (tính học phí) — đây là buổi học bù thật?`)) return false
    askedOffDay.current.add(date)
    return true
  }

  async function markOne(studentId: string, a: AttendanceKey) {
    if (!okForDay()) return
    await w.mark(studentId, date, a)
  }

  async function wholeClassPresent() {
    if (bulkRef.current) return
    const ids = stats.unmarked
    if (!ids.length) return
    bulkRef.current = true
    try {
      if (!okForDay()) return
      if (!confirm(`Ghi CÓ MẶT cho ${ids.length} em chưa điểm danh ngày ${weekdayLabel(date)} ${dm(date)}? Mỗi em sẽ có thêm 1 buổi ngày này (tính vào học phí). ${marked} em đã điểm danh giữ nguyên.`)) return
      setBulk(true)
      for (const id of ids) await w.mark(id, date, 'present')
    } finally { bulkRef.current = false; setBulk(false) }
  }

  if (!cls.students.length) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp chưa có học sinh nào.</div>
  if (!isMongoid(cls.id)) return <div className="rounded-2xl p-8 text-center text-sm" style={{ background: C.card, color: C.muted }}>Lớp này chưa lên server — điểm danh ở thẻ "Chấm từng em".</div>

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="inline-flex flex-wrap rounded-xl p-[3px]" style={{ background: C.line }} role="tablist" aria-label="Ngày điểm danh">
        {days.map((d) => (
          <button key={d.date} type="button" role="tab" aria-selected={date === d.date} data-day={d.date} onClick={() => setDate(d.date)} className="rounded-[9px] px-3 py-1.5 text-[13px] font-semibold"
            style={date === d.date ? { background: C.card, color: C.board, boxShadow: '0 1px 3px rgba(15,23,42,.12)' } : { color: C.muted }}>
            {d.date === today ? 'Hôm nay ' : ''}{weekdayLabel(d.date)} {dm(d.date)}{!d.scheduled ? ' (không đúng lịch)' : ''}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl shadow-sm" style={{ background: C.card }}>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <b style={{ color: C.ink }}>{cls.name} · {weekdayLabel(date)} {dm(date)}</b>
          <div className="ml-auto"><Btn size="sm" disabled={bulk || stats.unmarked.length === 0} loading={bulk} onClick={() => void wholeClassPresent()}>Cả lớp có mặt{stats.unmarked.length ? ` (${stats.unmarked.length} em chưa điểm danh)` : ''}</Btn></div>
          <div className="w-full text-[13px]" style={{ color: C.muted }} data-testid="day-stats">
            <b style={{ color: C.ink }}>{stats.present}</b> có mặt · <b style={{ color: C.ink }}>{stats.late}</b> muộn · <b style={{ color: C.ink }}>{stats.excused}</b> có phép · <b style={{ color: C.ink }}>{stats.absent}</b> không phép{stats.unmarked.length ? <> · <b style={{ color: C.rose }}>{stats.unmarked.length}</b> chưa điểm danh</> : null}
          </div>
        </div>
        {cls.students.map((st) => {
          const s = st.sessions.find((x) => x.date === date)
          const total = s ? sessionScore(s.entry, { ...r, comps: sessionComps(r, s) }) : null
          const busy = w.isBusy(st.id, date)
          const stt = w.status(st.id, date)
          return (
            <div key={st.id} data-qa-student={st.name} className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: `1px solid ${C.paper}` }}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold" style={{ color: C.ink }}>{st.name}</div>
                <div className="text-xs" style={{ color: stt === 'error' ? C.rose : C.muted }}>
                  {!s ? 'Chưa điểm danh' : total != null ? `Điểm ${total}` : 'Chưa chấm điểm'}
                  {busy || stt === 'saving' ? ' · đang lưu...' : stt === 'offline' ? ' · chờ mạng để gửi' : stt === 'error' ? ' · CHƯA lưu' : s?.dirty ? ' · chưa lên server' : ''}
                </div>
              </div>
              {BTN.map((b) => {
                const on = s?.entry.attendance === b.k
                return (
                  <button key={b.k} type="button" title={b.label} aria-label={`${b.label} — ${st.name}`} aria-pressed={on} disabled={busy || bulk} onClick={() => void markOne(st.id, b.k)}
                    className="h-10 w-10 shrink-0 rounded-xl text-sm font-black disabled:opacity-60"
                    style={on ? { background: b.color, color: '#fff', border: `1px solid ${b.color}` } : { background: C.card, color: C.muted, border: `1px solid ${C.line}` }}>
                    {b.mark}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="text-[13px] font-semibold" style={{ color: savedCount === marked ? C.emerald : C.amber }} data-testid="qa-footer">
        ● Mỗi lần bấm là lưu ngay lên server · đã lưu {savedCount}/{cls.students.length} em
      </div>
    </div>
  )
}
