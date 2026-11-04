import { useEffect, useState } from 'react'
import { classifyScoreJobs, collectScoreJobs, dayRecoveryRows, RECOVERABLE_KINDS, type ClassifiedJob, type DayRow, type DayRowStatus } from '@/business/strandedScores'
import { backupService, type SnapshotDayResult, type SnapshotDayVersion } from '@/services/backups'
import { pushRecoveredJob, snapshotClasses } from '@/services/recovery'
import { classService, type ApiClass } from '@/services/classes'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { ATTEND } from '@/constants/tags'
import { toast } from '@/store/toastStore'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

type FoundJob = ClassifiedJob & { sources: SnapshotDayVersion['sources'] }
type Row = DayRow<FoundJob>

const STATUS: Record<DayRowStatus, { label: string; color: string }> = {
  recoverable: { label: 'Tìm thấy, server chưa có', color: C.emerald },
  onServer: { label: 'Đã có trên server', color: C.muted },
  deleted: { label: 'Buổi đã bị xóa trên server', color: C.amber },
  none: { label: 'Không có trong bản chụp nào', color: C.red },
}

const when = (iso: string) => new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const sourceText = (s: SnapshotDayVersion['sources'][number]) =>
  `máy ${s.deviceId.slice(0, 8)}${s.user ? ` (${s.user.name})` : ''}, ${s.firstAt === s.lastAt ? when(s.firstAt) : `${when(s.firstAt)} → ${when(s.lastAt)}`}`

/** Tìm 1 lớp + 1 ngày trong MỌI bản chụp còn giữ của mọi máy, kết luận từng em:
 *  đã có trên server / tìm thấy và đưa lên được / không có ở đâu. Đưa lên chỉ điền
 *  chỗ server CHƯA có; bản khác với điểm đang có chỉ hiện để xem, không ghi đè. */
export function SnapshotSearchCard() {
  const [classes, setClasses] = useState<ApiClass[]>([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState('')
  const [searching, setSearching] = useState(false)
  const [pushing, setPushing] = useState<string | null>(null)
  const [found, setFound] = useState<SnapshotDayResult | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    classService.list({ status: 'active', limit: '100' })
      .then(({ items }) => setClasses([...items].sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))))
      .catch((err) => console.warn('Không tải được danh sách lớp:', err))
  }, [])

  /** Đối chiếu kết quả với dữ liệu server hiện tại (dùng lại sau mỗi lần đưa lên). */
  const classify = async (result: SnapshotDayResult, cid: string, day: string) => {
    const [students, serverSessions, serverScores] = await Promise.all([
      classService.getStudents(cid),
      sessionService.listAll({ classId: cid }),
      scoreService.listAll({ classId: cid }),
    ])
    const jobs: FoundJob[] = []
    for (const v of result.versions) {
      const session = { ...v.session, conflict: undefined }
      const cls = snapshotClasses({ classes: [{ ...(result.classMeta ?? {}), id: cid, name: result.classMeta?.name ?? '', students: [{ id: v.studentId, name: v.studentName, sessions: [session] }] }] })
      for (const job of collectScoreJobs(cls)) jobs.push({ ...job, kind: 'create', sources: v.sources })
    }
    const lite = serverSessions.map((s) => ({ _id: s._id, studentId: s.studentId, scheduledAt: s.scheduledAt, lessonNo: s.lessonNo }))
    const scoreLite = serverScores.items.map((x) => ({ ...x, scores: x.scores, ticks: x.ticks, choice: x.choice, parts: x.parts }))
    const roster = new Map([[cid, new Set(students.map((s) => s._id))]])
    const classified = classifyScoreJobs(jobs, lite, scoreLite, roster)
    const withSources = classified.map((c, i) => ({ ...c, sources: jobs[i].sources }))
    const onDay = new Set(lite.filter((s) => s.scheduledAt.slice(0, 10) === day).map((s) => s._id))
    const scored = new Set(serverScores.items.filter((x) => onDay.has(x.sessionId)).map((x) => x.studentId))
    setRows(dayRecoveryRows(students.map((s) => ({ id: s._id, name: s.name })), withSources, scored))
  }

  const search = async () => {
    setSearching(true)
    setFound(null)
    setRows(null)
    try {
      const result = await backupService.searchSnapshotSessions(classId, date)
      setFound(result)
      await classify(result, classId, date)
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`Không tìm được${msg ? `: ${msg}` : ' — kiểm tra mạng rồi thử lại'}`, { persist: true })
    } finally {
      setSearching(false)
    }
  }

  /** Đưa lên từng bản; đọc lại server sau khi xong để kết luận luôn đúng thực tế. */
  const push = async (items: FoundJob[], key: string) => {
    if (!found) return
    setPushing(key)
    let done = 0
    let failed = 0
    let refused = 0
    for (const item of items) {
      try {
        const r = await pushRecoveredJob(item, item.sources[0]?.user)
        if (r === 'done' || r === 'already') done++
        else refused++
      } catch {
        failed++
      }
    }
    try {
      await classify(found, classId, date)
    } catch { /* kết luận cũ vẫn hiện; thông báo dưới đây báo đúng số đã đưa lên */ }
    setPushing(null)
    if (failed || refused) toast.error(`Đã đưa ${done} buổi lên server, ${refused} buổi server đã có bản khác nên không ghi đè, ${failed} buổi lỗi mạng.`, { persist: true })
    else toast.success(`Đã đưa ${done} buổi lên server.`, { persist: true })
  }

  const canBulk = rows?.flatMap((r) => (r.status === 'recoverable' && r.versions.filter((v) => RECOVERABLE_KINDS.includes(v.kind)).length === 1 ? r.versions.filter((v) => RECOVERABLE_KINDS.includes(v.kind)) : [])) ?? []
  const count = (s: DayRowStatus) => rows?.filter((r) => r.status === s).length ?? 0
  const inputStyle = { border: `1px solid ${C.line}`, color: C.ink, background: '#fff' }

  return (
    <Card className="p-4 space-y-3">
      <div>
        <div className="font-bold" style={{ color: C.ink }}>Tìm buổi trong mọi bản chụp</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Chọn lớp và ngày. App đọc tất cả bản chụp còn giữ của mọi máy, kể cả dữ liệu đã biến khỏi máy, rồi cho biết từng em còn hay không.
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold" style={{ color: C.ink }}>
          Lớp
          <select aria-label="Lớp" value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1 block min-h-11 rounded-xl px-3 text-sm" style={inputStyle}>
            <option value="">Chọn lớp</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold" style={{ color: C.ink }}>
          Ngày học
          <input aria-label="Ngày học" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block min-h-11 rounded-xl px-3 text-sm" style={inputStyle} />
        </label>
        <Btn kind="solid" loading={searching} disabled={!classId || !date} onClick={search}>Tìm</Btn>
      </div>
      {searching && <div className="text-sm" style={{ color: C.muted }}>Đang đọc các bản chụp, có thể mất khoảng 1 phút…</div>}

      {found && rows && (
        <div className="space-y-2">
          <div className="text-sm" style={{ color: C.ink }}>
            Đã đọc <b>{found.scanned}</b> bản chụp của <b>{found.devices}</b> máy: <b style={{ color: C.emerald }}>{count('recoverable')}</b> em tìm thấy, <b>{count('onServer')}</b> em đã có trên server, <b style={{ color: C.red }}>{count('none')}</b> em không có.
          </div>
          {found.failed > 0 && (
            <div className="text-sm font-semibold" style={{ color: C.red }}>
              {found.failed} bản chụp đọc lỗi nên kết quả CHƯA đầy đủ, chưa nên kết luận "không có". Bấm Tìm lại.
            </div>
          )}
          {canBulk.length > 0 && (
            <Btn kind="solid" loading={pushing === 'all'} disabled={!!pushing} onClick={() => push(canBulk, 'all')}>Đưa {canBulk.length} buổi tìm thấy lên server</Btn>
          )}
          {rows.map((r) => (
            <div key={r.studentId} className="rounded-xl p-3 text-sm" style={{ border: `1px solid ${C.line}` }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold" style={{ color: C.ink }}>{r.studentName}</span>
                <span className="text-xs font-bold" style={{ color: STATUS[r.status].color }}>{STATUS[r.status].label}</span>
              </div>
              {r.versions.map((v, i) => {
                const key = `${r.studentId}-${i}`
                return (
                  <div key={key} className="mt-2 flex flex-wrap items-start justify-between gap-2" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                    <div className="min-w-0 flex-1" style={{ color: C.ink }}>
                      <div>
                        {ATTEND.find((a) => a.key === v.entry.attendance)?.label ?? v.entry.attendance} · {v.total} điểm
                        {v.entry.note?.trim() ? ` · "${v.entry.note.trim()}"` : ''}
                        {v.homework?.trim() ? ` · BTVN: ${v.homework.trim()}` : ''}
                      </div>
                      {v.kind === 'conflict' && <div className="text-xs font-semibold" style={{ color: C.amber }}>Khác bản đang có trên server ({v.serverTotal} điểm), chỉ để xem, không ghi đè.</div>}
                      {v.kind === 'deletedOnServer' && <div className="text-xs font-semibold" style={{ color: C.amber }}>Buổi này đã bị xóa trên server, khôi phục ở mục "Buổi đã xóa" nếu xóa nhầm.</div>}
                      {v.kind === 'notInClass' && <div className="text-xs font-semibold" style={{ color: C.amber }}>Em không còn trong lớp này, không tự tạo lại.</div>}
                      <div className="text-xs" style={{ color: C.muted }}>{v.sources.map(sourceText).join(' · ')}</div>
                    </div>
                    {RECOVERABLE_KINDS.includes(v.kind) && (
                      <Btn size="sm" kind="outline-primary" loading={pushing === key} disabled={!!pushing} onClick={() => push([v], key)}>Đưa bản này lên</Btn>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {count('none') > 0 && (
            <div className="text-sm" style={{ color: C.muted }}>
              Em "không có": không máy nào đã gửi bản chụp có buổi này. Máy đã nhập mà chưa từng có mạng lại thì vẫn có thể còn dữ liệu: mở app trên đúng máy đó, hoặc dùng "🛟 Bản sao lưu trên máy" → "Gửi lên để khôi phục" rồi tìm lại. Không còn máy nào thì phải nhập lại từ vở.
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
