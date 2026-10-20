import { useState } from 'react'
import { classService } from '@/services/classes'
import { sessionService } from '@/services/sessions'
import { findMissingSessions, type MissingReport } from '@/business/missingSessions'
import { toast } from '@/store/toastStore'
import { todayISO } from '@/utils/format'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

interface ClassResult {
  name: string
  names: Map<string, string>
  report: MissingReport
}

/** Kiểm tra buổi THIẾU của từng học sinh so với lịch học của cả lớp — phát
 *  hiện sớm dữ liệu mất/lạc/chưa nhập (sự cố thật: Lớp 3/4/5 mất 17/10 ở
 *  nhiều em, Lớp 10 cả lớp không có buổi nào sau 10/10). Chỉ đọc. */
export function MissingSessionsCard() {
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<ClassResult[] | null>(null)

  const scan = async () => {
    setRunning(true)
    try {
      const { items } = await classService.list({ status: 'active', limit: '100' })
      const out: ClassResult[] = []
      const today = todayISO()
      for (const cls of items) {
        const [students, sessions] = await Promise.all([
          classService.getStudents(cls._id),
          sessionService.listAll({ classId: cls._id }),
        ])
        if (!students.length) continue
        const report = findMissingSessions(
          students.map((s) => s._id),
          sessions.filter((s) => s.studentId).map((s) => ({ studentId: s.studentId!, date: s.scheduledAt.slice(0, 10) })),
          today,
        )
        if (report.noOneDays.length || report.byStudent.length) {
          out.push({ name: cls.name, names: new Map(students.map((s) => [s._id, s.name])), report })
        }
      }
      setResults(out.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true })))
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      toast.error(`Quét thất bại${msg ? `: ${msg}` : ''}`, { persist: true })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold" style={{ color: C.ink }}>Kiểm tra buổi thiếu</div>
          <div className="text-sm" style={{ color: C.muted }}>
            So từng học sinh với lịch học thực tế của cả lớp (suy theo ngày/thứ cả lớp có học). Ngày nghỉ lễ cũng sẽ hiện ra — bỏ qua những ngày đó.
          </div>
        </div>
        <Btn loading={running} onClick={scan}>Quét tất cả lớp</Btn>
      </div>
      {results && results.length === 0 && (
        <div className="text-sm font-semibold" style={{ color: C.emerald }}>✓ Không lớp nào thiếu buổi so với lịch học.</div>
      )}
      {results?.map((r) => (
        <div key={r.name} className="rounded-xl p-3 space-y-1 text-sm" style={{ border: `1px solid ${C.line}` }}>
          <div className="font-semibold" style={{ color: C.ink }}>{r.name}</div>
          {r.report.noOneDays.length > 0 && (
            <div style={{ color: C.red }}>
              Cả lớp CHƯA có buổi nào ngày: <b>{r.report.noOneDays.map(dm).join(', ')}</b> (đúng lịch học — chưa nhập hoặc bị mất?)
            </div>
          )}
          {r.report.byStudent.map((s) => (
            <div key={s.studentId} style={{ color: C.ink }}>
              {r.names.get(s.studentId) ?? 'Học sinh'}:{' '}
              <span style={{ color: s.noSessions ? C.amber : C.red }}>
                {s.noSessions ? 'chưa có buổi nào' : `thiếu ${s.missing.map(dm).join(', ')}`}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  )
}
