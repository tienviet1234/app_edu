import { useState } from 'react'
import type { ClassData, Session } from '@/types'
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
  /** true nếu số buổi này KHÔNG có sẵn trong Excel (cột "Số buổi học" trống/
   *  không phải số) — phải tự đánh số tiếp theo, khác với lấy đúng số thật. */
  noIsGuessed: boolean
  /** true nếu học sinh ĐÃ có buổi khác trùng NGÀY hoặc trùng SỐ BUỔI — chắc
   *  chắn là buổi đã chấm điểm thật, bỏ qua để không tạo trùng/đè dữ liệu thật. */
  conflict: boolean
  conflictReason: string
  homeworkText: string
  /** Buổi app ĐANG CÓ gây ra xung đột (trùng ngày hoặc trùng số) — hiện cạnh
   *  nhau để so sánh Excel vs. app tại chỗ, không cần mở 2 màn hình. */
  existing: { no: number; date: string; homework: string; note: string }[]
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
      const parsed = await parseSessionImportFile(file, student!.name)
      const existingDates = new Set(student!.sessions.map((s) => s.date))
      const existingNos = new Set(student!.sessions.map((s) => s.no))
      // Buổi nào Excel CÓ ghi sẵn số ("Số buổi học" của chính em này) thì lấy
      // ĐÚNG số đó — đây là số thật giáo viên đã dùng, không tự đoán lại theo
      // ngày (mỗi em có số riêng, không nhất thiết theo đúng thứ tự ngày).
      // Chỉ những dòng KHÔNG có số mới tự đánh tiếp theo số lớn nhất hiện có.
      let fallbackNo = Math.max(0, ...student!.sessions.map((s) => s.no)) + 1
      const seenNos = new Set<number>()
      const preview: PreviewRow[] = [...parsed]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => {
          const noIsGuessed = r.sourceNo == null
          const no = r.sourceNo ?? fallbackNo
          if (noIsGuessed) fallbackNo += 1
          const dateConflict = existingDates.has(r.date)
          const noConflict = existingNos.has(no) || seenNos.has(no)
          seenNos.add(no)
          const conflictReason = dateConflict && noConflict
            ? 'trùng cả ngày lẫn số buổi với dữ liệu đã có'
            : dateConflict
              ? 'đã có buổi ngày này'
              : noConflict
                ? `đã có/trùng Buổi ${no}`
                : ''
          // Lấy đúng buổi app đang có gây trùng — để hiện cạnh nhau so sánh,
          // khỏi phải mở riêng màn "Lớp học" tìm lại buổi đó.
          const existing: PreviewRow['existing'] = []
          const pushExisting = (ss: Session | undefined) => {
            if (ss && !existing.some((e) => e.no === ss.no && e.date === ss.date)) {
              existing.push({ no: ss.no, date: ss.date, homework: ss.homework ?? '', note: ss.entry.note })
            }
          }
          if (dateConflict) pushExisting(student!.sessions.find((s) => s.date === r.date))
          if (noConflict) pushExisting(student!.sessions.find((s) => s.no === no))
          const row: PreviewRow = {
            ...r, no, noIsGuessed, conflict: dateConflict || noConflict, conflictReason,
            homeworkText: buildHomeworkText(r), existing,
          }
          return row
        })
      setRows(preview)
      // BUG trước đây: lấy index từ mảng ĐÃ LỌC (chỉ các dòng không trùng),
      // trong khi `included` được dùng để tra cứu trên mảng GỐC `preview` —
      // 2 mảng index lệch nhau khiến tích chọn sai dòng khi có buổi bị khóa
      // (trùng ngày) nằm xen giữa. Phải lấy index TRÊN CHÍNH `preview`.
      const ok = new Set<number>()
      preview.forEach((r, i) => { if (!r.conflict) ok.add(i) })
      setIncluded(ok)
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
              Chọn file Excel theo dõi buổi học (dùng chung cho cả lớp cũng được — hệ thống tự tìm đúng
              cụm cột "Buổi học/Ngày học" có tiêu đề khớp tên <b>{student.name}</b>, không lấy nhầm của em
              khác). Các buổi chưa có ngày (chưa dạy) sẽ tự bỏ qua.
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
                  Tìm thấy {rows.length} buổi — số buổi lấy ĐÚNG theo cột "Số buổi học" của em này trong
                  Excel (không tự đánh số lại), trừ dòng nào Excel không ghi số thì mới tự đánh tiếp theo
                  (đánh dấu <i>tự đoán</i>). Buổi trùng ngày hoặc trùng số với dữ liệu đã có sẽ tự khóa.
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
                          Buổi {r.no}{r.noIsGuessed && <span className="font-normal italic" style={{ color: C.muted }}> (tự đoán)</span>} — {viDate(r.date)}
                          {r.conflict && <span className="ml-1 font-normal" style={{ color: C.red }}>⚠ {r.conflictReason} — bỏ qua</span>}
                        </div>
                        <div style={{ color: C.muted }}>{r.homeworkText || '(không có bài tập)'}</div>
                        {r.note && <div className="mt-0.5 italic" style={{ color: C.muted }}>"{r.note}"</div>}
                        {r.existing.length > 0 && (
                          <div className="mt-1 space-y-1 border-l-2 pl-2" style={{ borderColor: C.red }}>
                            {r.existing.map((e, j) => (
                              <div key={j}>
                                <div className="font-semibold" style={{ color: C.red }}>
                                  App đang có: Buổi {e.no} — {viDate(e.date)}
                                </div>
                                <div style={{ color: C.muted }}>{e.homework || '(không có bài tập)'}</div>
                                {e.note && <div className="italic" style={{ color: C.muted }}>"{e.note}"</div>}
                              </div>
                            ))}
                          </div>
                        )}
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
