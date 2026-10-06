import { useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { emptyEntry } from '@/business/seed'
import { parseSessionImportFile, type ImportedSessionRow } from '@/utils/excelImport'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { logActivity } from '@/services/activity'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  cls: ClassData
  studentId: string
  teacherName?: string
  update: (fn: (c: ClassData) => void) => void
  onClose: () => void
}

interface PreviewRow extends ImportedSessionRow {
  no: number
  /** true nếu học sinh ĐÃ có buổi khác đúng ngày này — chắc chắn là buổi đã
   *  chấm điểm thật, bỏ qua để không tạo trùng/đè dữ liệu thật. */
  conflict: boolean
  homeworkText: string
}

/** "Bài tập về nhà" ghép thêm chủ đề/tên sách lên đầu (nếu có) để không mất
 *  thông tin bài học khi app chưa có field riêng cho chủ đề/trang sách. */
function buildHomeworkText(r: ImportedSessionRow): string {
  const prefix = [r.topic, r.book].filter(Boolean).join(' — ')
  if (!prefix) return r.homework
  return r.homework ? `[${prefix}] ${r.homework}` : `[${prefix}]`
}

export function ImportHomeworkModal({ cls, studentId, teacherName, update, onClose }: Props) {
  const student = cls.students.find((s) => s.id === studentId)
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [included, setIncluded] = useState<Set<number>>(new Set())
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  if (!student) return null

  async function handleFile(file: File) {
    setParsing(true)
    setError('')
    try {
      const parsed = await parseSessionImportFile(file)
      const existingDates = new Set(student!.sessions.map((s) => s.date))
      let nextNo = Math.max(0, ...student!.sessions.map((s) => s.no)) + 1
      const preview: PreviewRow[] = [...parsed]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => {
          const conflict = existingDates.has(r.date)
          const row: PreviewRow = { ...r, no: nextNo, conflict, homeworkText: buildHomeworkText(r) }
          if (!conflict) nextNo += 1
          return row
        })
      setRows(preview)
      setIncluded(new Set(preview.filter((r) => !r.conflict).map((_, i) => i)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được file này.')
    } finally {
      setParsing(false)
    }
  }

  function toggle(i: number) {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function confirmImport() {
    if (!rows || included.size === 0) return
    setImporting(true)
    let okCount = 0
    let failCount = 0
    for (const i of included) {
      const r = rows[i]
      if (r.conflict || !isMongoid(cls.id) || !isMongoid(studentId)) continue
      try {
        const apiSession = await sessionService.create({
          classId: cls.id,
          studentId,
          title: r.topic || `Buổi ${r.no}`,
          lessonNo: r.no,
          scheduledAt: `${r.date}T00:00:00.000Z`,
          notes: r.homeworkText || undefined,
        })
        await scoreService.upsert({
          classId: cls.id, sessionId: apiSession._id, studentId,
          ...emptyEntry(), note: r.note, total: 0,
        })
        update((c) => {
          const stu = c.students.find((s) => s.id === studentId)
          stu?.sessions.push({
            id: apiSession._id, no: r.no, date: r.date, homework: r.homeworkText,
            entry: { ...emptyEntry(), note: r.note },
            createdByName: teacherName, recordedAt: apiSession.createdAt,
          })
          stu?.sessions.sort((a, b) => a.no - b.no)
        })
        okCount += 1
      } catch {
        failCount += 1
      }
    }
    setImporting(false)
    logActivity('session.import', { className: cls.name, studentName: student!.name, count: okCount }, 'ClassSession')
    if (okCount) toast.success(`Đã nhập ${okCount} buổi cho ${student!.name}${failCount ? ` (${failCount} buổi lỗi)` : ''}`)
    else toast.error('Không nhập được buổi nào — thử lại.')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000060' }}
      onClick={onClose}
    >
      <Card
        className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="font-bold text-base" style={{ color: C.ink }}>
          📥 Nhập buổi học từ Excel — {student.name}
        </div>

        {!rows && (
          <>
            <div className="text-xs" style={{ color: C.muted }}>
              Chọn file Excel theo dõi buổi học của ĐÚNG học sinh này. Cần có cột "Bài tập về nhà" và
              "Ngày học" — các buổi chưa có ngày (chưa dạy) sẽ tự bỏ qua.
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={parsing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />
            {parsing && <div className="text-xs" style={{ color: C.muted }}>Đang đọc file...</div>}
            {error && <div className="text-xs font-semibold" style={{ color: C.red }}>⚠ {error}</div>}
          </>
        )}

        {rows && (
          <>
            {rows.length === 0 ? (
              <div className="text-sm" style={{ color: C.muted }}>
                Không tìm thấy buổi nào có ngày học hợp lệ trong file này.
              </div>
            ) : (
              <>
                <div className="text-xs" style={{ color: C.muted }}>
                  Tìm thấy {rows.length} buổi — bỏ chọn dòng nào không muốn nhập. Buổi trùng ngày với dữ
                  liệu đã có sẽ tự khóa (không ghi đè).
                </div>
                <div className="space-y-1.5">
                  {rows.map((r, i) => (
                    <label
                      key={i}
                      className="flex items-start gap-2 rounded-lg p-2 text-xs"
                      style={{ border: `1px solid ${C.line}`, background: r.conflict ? '#FEF2F2' : C.paper, opacity: r.conflict ? 0.6 : 1 }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={included.has(i)}
                        disabled={r.conflict}
                        onChange={() => toggle(i)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold" style={{ color: C.ink }}>
                          Buổi {r.no} — {viDate(r.date)}
                          {r.conflict && <span className="ml-1 font-normal" style={{ color: C.red }}>⚠ đã có buổi ngày này — bỏ qua</span>}
                        </div>
                        <div style={{ color: C.muted }}>{r.homeworkText || '(không có bài tập)'}</div>
                        {r.note && <div className="mt-0.5 italic" style={{ color: C.muted }}>"{r.note}"</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Btn onClick={onClose}>Hủy</Btn>
          {rows && rows.length > 0 && (
            <Btn kind="gold" loading={importing} disabled={included.size === 0} onClick={confirmImport} className="flex-1">
              ✅ Xác nhận nhập {included.size} buổi
            </Btn>
          )}
        </div>
      </Card>
    </div>
  )
}
