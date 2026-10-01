import { useRef, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { uid } from '@/utils/uid'
import { matchStudentsByName, type StudentMatch } from '@/business/aiMatch'
import { aiGradingService } from '@/services/aiGrading'
import { submissionService } from '@/services/submissions'
import type { Assignment } from '@/services/assignments'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  classId: string
  classes: ClassData[]
  assignment: Assignment
  onSubmitted: () => void
}

interface Row {
  id: string
  file: File
  previewUrl: string
  status: 'pending' | 'identifying' | 'identified' | 'submitting' | 'submitted' | 'error'
  error?: string
  studentName: string
  nameConfidence: 'high' | 'low'
  matches: StudentMatch[]
  studentId: string
}

function newRow(file: File): Row {
  return {
    id: uid(), file, previewUrl: URL.createObjectURL(file), status: 'pending',
    studentName: '', nameConfidence: 'low', matches: [], studentId: '',
  }
}

/** Giáo viên quét 1 xấp giấy học sinh nộp tay (lớp không dùng điện thoại
 *  được) — chọn nhiều ảnh cùng lúc, AI đọc tên từng tờ, tự khớp về đúng em,
 *  giáo viên xem lại/chọn lại nếu cần rồi mới nộp hộ qua hệ thống "Bài tập"
 *  như bình thường (submittedBy = giáo viên). Chỉ dùng cho bài tập loại
 *  "Ảnh" — không áp dụng video/trắc nghiệm. */
export function BulkSubmitPanel({ classId, classes, assignment, onSubmitted }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [identifying, setIdentifying] = useState(false)
  const [submittingAll, setSubmittingAll] = useState(false)

  const patch = (id: string, fn: (r: Row) => void) =>
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r
      const copy = { ...r }
      fn(copy)
      return copy
    }))

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    setRows((prev) => [...prev, ...Array.from(files).map(newRow)])
  }

  function applyMatch(row: Row, m: StudentMatch | undefined) {
    row.studentId = m?.studentId ?? ''
  }

  async function identifyOne(row: Row) {
    patch(row.id, (r) => { r.status = 'identifying'; r.error = undefined })
    try {
      const res = await aiGradingService.identifyStudent(row.file)
      const matches = res.studentName ? matchStudentsByName(classes, res.studentName, classId) : []
      patch(row.id, (r) => {
        r.studentName = res.studentName
        r.nameConfidence = res.nameConfidence
        r.matches = matches
        r.status = res.studentName ? 'identified' : 'error'
        if (!res.studentName) r.error = 'Không thấy tên trên ảnh này — tự chọn học sinh bên dưới.'
        applyMatch(r, matches.length === 1 ? matches[0] : undefined)
      })
    } catch {
      patch(row.id, (r) => { r.status = 'error'; r.error = 'Lỗi khi nhận diện — thử lại.' })
    }
  }

  async function identifyAll() {
    setIdentifying(true)
    for (const row of rows) {
      if (row.status === 'pending' || row.status === 'error') await identifyOne(row)
    }
    setIdentifying(false)
  }

  async function submitAll() {
    const ready = rows.filter((r) => r.studentId && r.status !== 'submitted' && r.status !== 'submitting')
    if (!ready.length) { toast.error('Chưa có ảnh nào xác định được học sinh.'); return }
    setSubmittingAll(true)
    let ok = 0
    for (const row of ready) {
      patch(row.id, (r) => { r.status = 'submitting' })
      try {
        await submissionService.submit({
          assignmentId: assignment._id, classId, studentId: row.studentId, photos: [row.file],
        })
        patch(row.id, (r) => { r.status = 'submitted' })
        ok++
      } catch {
        patch(row.id, (r) => { r.status = 'error'; r.error = 'Nộp lỗi — thử lại.' })
      }
    }
    setSubmittingAll(false)
    if (ok) {
      toast.success(`Đã nộp hộ ${ok} bài.`)
      onSubmitted()
    }
  }

  const allStudents = classes.flatMap((c, ci) =>
    c.students.map((s) => ({ classIndex: ci, className: c.name, studentId: s.id, studentName: s.name })),
  )

  return (
    <Card className="p-3 space-y-2">
      <div className="text-sm font-bold" style={{ color: C.ink }}>📤 Nộp bài giúp (ảnh giấy nộp tay, nhiều em cùng lúc)</div>
      <div className="text-xs" style={{ color: C.muted }}>
        Dùng khi lớp không nộp bài qua điện thoại được — chụp mỗi em 1 ảnh, chọn hết 1 lần, AI tự đọc tên và
        khớp về đúng em, bạn xem lại rồi nộp hộ.
      </div>
      <input
        ref={fileInputRef}
        type="file" accept="image/jpeg,image/png,image/webp" multiple
        className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
      />
      <div className="flex flex-wrap gap-2">
        <Btn kind="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>+ Chọn ảnh (nhiều ảnh)</Btn>
        {rows.some((r) => r.status === 'pending' || r.status === 'error') && (
          <Btn kind="ghost" size="sm" onClick={identifyAll} disabled={identifying}>
            {identifying ? 'Đang nhận diện...' : '🔍 Nhận diện tên cả xấp'}
          </Btn>
        )}
        {rows.some((r) => r.studentId && r.status !== 'submitted') && (
          <Btn kind="solid" size="sm" onClick={submitAll} disabled={submittingAll}>
            {submittingAll ? 'Đang nộp...' : '✅ Nộp tất cả đã khớp'}
          </Btn>
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.id} className="space-y-1 rounded-lg p-2" style={{ border: `1px solid ${C.line}` }}>
              <img src={row.previewUrl} alt="" className="h-20 w-full rounded object-cover" />
              {row.status === 'identifying' && <div className="text-xs" style={{ color: C.muted }}>Đang đọc tên...</div>}
              {row.status === 'submitted' ? (
                <div className="text-xs font-semibold" style={{ color: C.emerald }}>✓ Đã nộp</div>
              ) : (
                <>
                  {row.studentName && (
                    <div className="truncate text-xs" style={{ color: C.muted }}>AI đọc: "{row.studentName}"</div>
                  )}
                  <select
                    value={row.studentId}
                    onChange={(e) => patch(row.id, (r) => { r.studentId = e.target.value })}
                    className="w-full rounded px-1.5 py-1 text-xs"
                    style={{ border: `1px solid ${C.line}` }}
                  >
                    <option value="">— Chọn học sinh —</option>
                    {(row.matches.length ? row.matches : allStudents).map((m) => (
                      <option key={`${m.classIndex}:${m.studentId}`} value={m.studentId}>
                        {m.studentName} — {m.className}
                      </option>
                    ))}
                  </select>
                  {row.error && <div className="text-xs" style={{ color: C.red }}>{row.error}</div>}
                  {row.status === 'submitting' && <div className="text-xs" style={{ color: C.muted }}>Đang nộp...</div>}
                </>
              )}
              <button
                className="text-xs" style={{ color: C.muted }}
                onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
              >
                Bỏ ảnh này
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
