import { useState } from 'react'
import { classService } from '@/services/classes'
import { sessionService } from '@/services/sessions'
import { changeHistoryService, type FieldChange, type SessionHistory, type StudentChange } from '@/services/changeHistory'
import { logActivity } from '@/services/activity'
import { toast } from '@/store/toastStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10)

const GROUP: Record<string, string> = {
  attendance: 'Điểm danh', scores: 'Điểm', tags: 'Thẻ', ticks: 'Tích', choice: 'Lựa chọn', parts: 'Phần', skip: 'Không làm', ev: 'Minh chứng', note: 'Nhận xét',
  lessonNo: 'Số buổi', scheduledAt: 'Ngày học', notes: 'Bài tập về nhà', maxes: 'Số câu', billed: 'Đã thu tiền', deletedAt: 'Đã xóa',
}
const fieldLabel = (f: string) => { const [g, ...rest] = f.split('.'); return [GROUP[g] ?? g, ...rest].join(' · ') }
const val = (f: string, v: string | null) => (v === null ? '(trống)' : f === 'scheduledAt' || f === 'deletedAt' ? dm(vnDate(v)) : v)

function Changes({ changes }: { changes: FieldChange[] }) {
  if (!changes.length) return <div className="text-xs" style={{ color: C.muted }}>(không đổi nội dung)</div>
  return (
    <ul className="text-xs space-y-0.5">
      {changes.map((c) => (
        <li key={c.field} style={{ color: C.ink }}>
          <span style={{ color: C.muted }}>{fieldLabel(c.field)}:</span> {val(c.field, c.before)} <span style={{ color: C.muted }}>→</span> <b>{val(c.field, c.after)}</b>
        </li>
      ))}
    </ul>
  )
}

/** Lịch sử điểm & khôi phục — xem mọi phiên bản cũ của điểm/buổi (ghi tự động
 *  mỗi lần sửa, giữ 180 ngày) và khôi phục 1 phiên bản điểm cũ ngay trên app,
 *  không cần nhờ chạy lệnh. Khôi phục cũng được cất bản hiện tại lại trước → bấm
 *  nhầm vẫn quay lại được. Dữ liệu lấy thẳng từ server, không phụ thuộc máy này. */
export function ChangeHistoryCard() {
  const [classes, setClasses] = useState<Array<{ _id: string; name: string }> | null>(null)
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<Array<{ _id: string; name: string }>>([])
  const [studentId, setStudentId] = useState('')
  const [sessions, setSessions] = useState<Array<{ _id: string; lessonNo?: number; scheduledAt: string }>>([])
  const [recent, setRecent] = useState<StudentChange[]>([])
  const [sessionId, setSessionId] = useState('')
  const [hist, setHist] = useState<SessionHistory | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Lỗi khi tải — thử lại.', { persist: true })

  const open = async () => {
    setBusy(true)
    try { setClasses((await classService.list({ limit: '100' })).items.map((c) => ({ _id: c._id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const pickClass = async (id: string) => {
    setClassId(id); setStudentId(''); setStudents([]); setSessions([]); setRecent([]); setSessionId(''); setHist(null)
    if (!id) return
    try { setStudents((await classService.getStudents(id)).map((s) => ({ _id: s._id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'))) } catch (e) { fail(e) }
  }
  const pickStudent = async (id: string) => {
    setStudentId(id); setSessions([]); setRecent([]); setSessionId(''); setHist(null)
    if (!id) return
    setBusy(true)
    try {
      const [all, changes] = await Promise.all([sessionService.listAll({ classId }), changeHistoryService.ofStudent(id)])
      setSessions(all.filter((s) => s.studentId === id).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)))
      setRecent(changes)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const pickSession = async (id: string) => {
    setSessionId(id); setHist(null)
    if (!id) return
    setBusy(true)
    try { setHist(await changeHistoryService.ofSession(id)) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const restore = async (v: SessionHistory['scoreVersions'][number]) => {
    if (!hist) return
    const label = `Buổi ${hist.session.lessonNo} (${dm(vnDate(hist.session.scheduledAt))}) của ${students.find((s) => s._id === studentId)?.name ?? 'học sinh'}`
    if (!confirm(`Khôi phục điểm ${label} về đúng như TRƯỚC lần sửa lúc ${when(v.at)}?\n\nTổng điểm: ${hist.score?.total ?? '—'} → ${v.before.total}\n\nBản hiện tại được cất lại trong lịch sử — khôi phục nhầm vẫn quay lại được. Máy giáo viên tự cập nhật khi mở lớp (máy đang sửa dở đúng buổi này sẽ được hỏi giữ bản nào).`)) return
    setBusy(true)
    try {
      await changeHistoryService.restore(v.id)
      logActivity('score.restoreVersion', { item: label, versionAt: v.at }, 'Score')
      toast.success(`✓ Đã khôi phục ${label}.`)
      setHist(await changeHistoryService.ofSession(hist.session._id))
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const sel = 'rounded-xl px-3 py-2 text-sm w-full sm:w-auto'
  const selStyle = { border: `1px solid ${C.line}`, background: C.card, color: C.ink }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <div className="font-bold" style={{ color: C.ink }}>🕘 Lịch sử điểm & khôi phục</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Mỗi lần điểm/buổi học bị sửa, bản cũ được cất tự động (giữ 180 ngày, từ 22/10). Chọn đúng buổi để xem ai sửa gì lúc nào, và khôi phục điểm về 1 bản cũ. Trước 22/10 chỉ còn trong bản sao lưu DB hằng ngày.
        </div>
      </div>
      {!classes ? (
        <Btn onClick={() => void open()} disabled={busy}>{busy ? 'Đang tải...' : 'Mở'}</Btn>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select className={sel} style={selStyle} value={classId} onChange={(e) => void pickClass(e.target.value)}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          {classId && (
            <select className={sel} style={selStyle} value={studentId} onChange={(e) => void pickStudent(e.target.value)}>
              <option value="">— Chọn học sinh —</option>
              {students.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          )}
          {studentId && (
            <select className={sel} style={selStyle} value={sessionId} onChange={(e) => void pickSession(e.target.value)}>
              <option value="">— Chọn buổi —</option>
              {sessions.map((s) => <option key={s._id} value={s._id}>Buổi {s.lessonNo ?? '?'} · {dm(vnDate(s.scheduledAt))}</option>)}
            </select>
          )}
        </div>
      )}

      {studentId && !sessionId && (
        <div className="space-y-1">
          <div className="text-sm font-semibold" style={{ color: C.ink }}>Thay đổi gần đây của em này ({recent.length})</div>
          {!recent.length && <div className="text-sm" style={{ color: C.muted }}>Chưa có lần sửa nào được ghi lại.</div>}
          {recent.slice(0, 40).map((r) => (
            <button key={r.id} type="button" disabled={!r.sessionId} onClick={() => r.sessionId && void pickSession(r.sessionId)}
              className="block w-full text-left rounded-lg px-2 py-1 text-xs hover:brightness-[0.93]" style={{ background: C.paper, color: C.ink }}>
              {when(r.at)} · {r.coll === 'scores' ? 'Sửa điểm' : 'Sửa buổi'} · Buổi {r.lessonNo ?? '?'}{r.scheduledAt ? ` (${dm(vnDate(r.scheduledAt))})` : ''}
              {r.sessionDeleted && <b style={{ color: C.amber }}> · buổi đã xóa</b>}
            </button>
          ))}
        </div>
      )}

      {busy && sessionId && <div className="text-sm" style={{ color: C.muted }}>Đang tải...</div>}
      {hist && (
        <div className="space-y-3">
          <div className="rounded-xl p-3 text-sm" style={{ background: C.paper, color: C.ink }}>
            <b>Hiện tại</b> · Buổi {hist.session.lessonNo} · {dm(vnDate(hist.session.scheduledAt))}
            {hist.session.deletedAt && <b style={{ color: C.amber }}> · buổi đã xóa</b>}
            {hist.session.billed && <span style={{ color: C.muted }}> · đã thu tiền</span>}
            {' '}· {hist.score ? <>tổng <b>{hist.score.total}</b>{hist.score.note ? ` · "${hist.score.note.slice(0, 60)}"` : ''}{hist.scoreUpdatedAt ? <span style={{ color: C.muted }}> · sửa lần cuối {when(hist.scoreUpdatedAt)}</span> : null}</> : 'chưa có điểm'}
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold" style={{ color: C.ink }}>Các lần sửa ĐIỂM ({hist.scoreVersions.length}) — mới nhất trước</div>
            {!hist.scoreVersions.length && <div className="text-sm" style={{ color: C.muted }}>Chưa có lần sửa nào được ghi lại cho điểm buổi này.</div>}
            {hist.scoreVersions.map((v) => (
              <div key={v.id} className="rounded-xl p-2 space-y-1" style={{ border: `1px solid ${C.line}` }}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span style={{ color: C.ink }}>
                    <b>{when(v.at)}</b> · {v.by ? `${v.by} sửa` : 'không rõ ai sửa'} · tổng {v.totalBefore ?? '—'} → {v.totalAfter ?? '—'}
                  </span>
                  <Btn size="sm" kind="outline-primary" disabled={busy} onClick={() => void restore(v)}>Khôi phục bản trước lần sửa này</Btn>
                </div>
                <Changes changes={v.changes} />
              </div>
            ))}
          </div>
          {hist.sessionVersions.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-semibold" style={{ color: C.ink }}>Các lần sửa BUỔI HỌC ({hist.sessionVersions.length}) — chỉ xem</div>
              {hist.sessionVersions.map((v) => (
                <div key={v.id} className="rounded-xl p-2 space-y-1" style={{ border: `1px solid ${C.line}` }}>
                  <div className="text-sm" style={{ color: C.ink }}><b>{when(v.at)}</b> · {v.by ? `${v.by} sửa` : 'không rõ ai sửa'}</div>
                  <Changes changes={v.changes} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
