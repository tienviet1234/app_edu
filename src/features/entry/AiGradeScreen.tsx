import { useState } from 'react'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getClassRubric } from '@/constants/rubrics'
import { todayISO, viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { uid } from '@/utils/uid'
import { emptyEntry } from '@/business/seed'
import { sessionScore } from '@/business/scoring'
import { matchStudentsByName, type StudentMatch } from '@/business/aiMatch'
import { aiGradingService, type AiGradeResult } from '@/services/aiGrading'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface AiGradeScreenProps {
  data: AppData
  setData: (fn: (d: AppData) => void) => void
}

interface Row {
  id: string
  file: File
  previewUrl: string
  status: 'pending' | 'grading' | 'read' | 'saving' | 'saved' | 'error'
  error?: string
  ai?: AiGradeResult
  matches: StudentMatch[]
  // studentId đã chọn (tự động nếu match tuyệt đối 1 kết quả, không thì giáo
  // viên phải tự chọn) — rỗng nghĩa là chưa xác định được.
  studentId: string
  classIndex: number
  date: string
  compKey: string
  // Điểm gốc có thể sửa tay nếu AI đọc sai — vẫn là "bao nhiêu trên bao nhiêu"
  // của TỜ GIẤY đó, không phải điểm đã quy đổi theo rubric.
  rawScore: number
  rawMax: number
  // true nếu lúc chấm ảnh này có kèm đáp án mẫu — hiện cho biết độ tin cậy,
  // không ảnh hưởng gì tới cách lưu điểm.
  usedAnswerKey: boolean
}

function newRow(file: File): Row {
  return {
    id: uid(), file, previewUrl: URL.createObjectURL(file), status: 'pending',
    matches: [], studentId: '', classIndex: -1, date: todayISO(), compKey: '',
    rawScore: 0, rawMax: 0, usedAnswerKey: false,
  }
}

/** Tiêu chí AI điền được — chỉ hỗ trợ dạng "score" (1 con số, VD Mini Test,
 *  Listening). Các dạng khác (ticks/parts/choice — BTVN, video bài nói...)
 *  cần đánh giá theo hành vi/nộp bài thật, không suy ra được từ 1 ảnh đề. */
function scoreComps(cls: ClassData) {
  return getClassRubric(cls).comps.filter((c) => c.type === 'score')
}

export function AiGradeScreen({ data, setData }: AiGradeScreenProps) {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  // Đáp án đúng của đề — áp dụng chung cho cả lượt chấm (giáo viên thường
  // quét cả xấp bài CÙNG 1 đề). Không bắt buộc, giúp AI so khớp chính xác
  // hơn với bài CHƯA được chấm tay sẵn, thay vì tự đoán đáp án đúng.
  const [answerKey, setAnswerKey] = useState('')

  const patch = (id: string, fn: (r: Row) => void) =>
    setRows((prev) => prev.map((r) => (r.id === id ? produce(r, fn) : r)))

  function addFiles(files: FileList | null) {
    if (!files?.length) return
    setRows((prev) => [...prev, ...Array.from(files).map(newRow)])
  }

  function applyMatch(row: Row, m: StudentMatch | undefined) {
    row.studentId = m?.studentId ?? ''
    row.classIndex = m?.classIndex ?? -1
    if (m) {
      const cls = data.classes[m.classIndex]
      const comps = scoreComps(cls)
      row.compKey = comps[0]?.key ?? ''
    } else {
      row.compKey = ''
    }
  }

  async function gradeOne(row: Row) {
    patch(row.id, (r) => { r.status = 'grading'; r.error = undefined })
    const keyUsed = answerKey.trim()
    try {
      const ai = await aiGradingService.gradePhoto(row.file, keyUsed || undefined)
      const matches = ai.studentName ? matchStudentsByName(data.classes, ai.studentName) : []
      patch(row.id, (r) => {
        r.ai = ai
        r.matches = matches
        r.rawScore = ai.rawScore
        r.rawMax = ai.rawMax
        r.usedAnswerKey = !!keyUsed
        r.status = ai.unreadable ? 'error' : 'read'
        if (ai.unreadable) r.error = 'AI không đọc được ảnh này rõ ràng — thử chụp lại.'
        applyMatch(r, matches.length === 1 ? matches[0] : undefined)
      })
    } catch (err) {
      const msg =
        (err as { response?: { status?: number; data?: { message?: string } } })?.response?.data?.message
        ?? 'Lỗi khi gọi AI — thử lại.'
      patch(row.id, (r) => { r.status = 'error'; r.error = msg })
    }
  }

  async function gradeAll() {
    setRunning(true)
    // Chấm TUẦN TỰ, không song song — mỗi ảnh tốn phí thật, chạy song song
    // nhiều ảnh cùng lúc dễ vượt giới hạn tốc độ và khó theo dõi tiến độ.
    for (const row of rows) {
      if (row.status === 'pending' || row.status === 'error') await gradeOne(row)
    }
    setRunning(false)
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  async function saveRow(row: Row) {
    if (!row.studentId || row.classIndex < 0 || !row.compKey || row.rawMax <= 0) return
    const cls = data.classes[row.classIndex]
    const student = cls.students.find((s) => s.id === row.studentId)
    if (!student || !isMongoid(cls.id) || !isMongoid(student.id)) {
      toast.error('Học sinh/lớp này chưa đồng bộ lên server — mở lại app rồi thử lại.')
      return
    }
    const comp = scoreComps(cls).find((c) => c.key === row.compKey)
    if (!comp) return
    const pct = row.rawMax > 0 ? row.rawScore / row.rawMax : 0
    const scoreValue = Math.round(pct * comp.max)

    patch(row.id, (r) => { r.status = 'saving' })
    try {
      // Tìm buổi đã có sẵn đúng ngày này của em, không thì tạo mới — giữ
      // nguyên các tiêu chí khác đã chấm nếu buổi đó đã tồn tại.
      let session = student.sessions.find((s) => s.date === row.date)
      let sessionId = session?.id ?? ''
      const isNew = !session
      if (!session) {
        const apiSession = await sessionService.create({
          classId: cls.id, studentId: student.id,
          title: `Buổi ${student.sessions.length + 1}`,
          lessonNo: student.sessions.length + 1,
          scheduledAt: `${row.date}T00:00:00.000Z`,
        })
        sessionId = apiSession._id
      }
      const entry = session ? { ...session.entry } : emptyEntry()
      entry.scores = { ...entry.scores, [row.compKey]: scoreValue }
      if (isNew && row.ai?.errors.length) entry.note = row.ai.errors.join(', ')

      const r = getClassRubric(cls)
      const allComps = r.comps.map((c) => (c.key === row.compKey ? comp : c))
      const total = sessionScore(entry, { ...r, comps: allComps }) ?? 0

      await scoreService.upsert({ classId: cls.id, sessionId, studentId: student.id, ...entry, total })

      setData(produce((d: AppData) => {
        const c2 = d.classes[row.classIndex]
        const st2 = c2.students.find((s) => s.id === row.studentId)
        if (!st2) return
        let ss2 = st2.sessions.find((s) => s.id === sessionId)
        if (!ss2) {
          ss2 = { id: sessionId, no: st2.sessions.length + 1, date: row.date, homework: '', entry }
          st2.sessions.push(ss2)
          st2.sessions.sort((a, b) => a.no - b.no)
        } else {
          ss2.entry = entry
        }
      }))

      patch(row.id, (r2) => { r2.status = 'saved' })
      toast.success(`Đã lưu điểm ${comp.label} cho ${student.name} (${cls.name})`)
    } catch {
      patch(row.id, (r2) => { r2.status = 'error'; r2.error = 'Lỗi khi lưu điểm — thử lại.' })
    }
  }

  const allStudents = data.classes.flatMap((c, ci) =>
    c.students.map((s) => ({ classIndex: ci, className: c.name, studentId: s.id, studentName: s.name })),
  )

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-2">
        <div className="text-lg font-bold" style={{ color: C.ink }}>📷 Chấm bằng AI</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Chụp/chọn ảnh từng bài kiểm tra giấy (có ghi tên học sinh) — AI đọc tên, tự xếp đúng học sinh/lớp và
          đếm điểm, bạn xem lại rồi mới lưu. Nhận diện được cả khoanh tròn, tick, tô đậm, nối câu lẫn điền vào
          chỗ trống. Chỉ dùng được cho tiêu chí dạng điểm số (VD Mini Test, Nghe) — bài tập viết tay dạng chữa
          lỗi/BTVN vẫn phải chấm tay ở Nhập điểm như cũ.
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" style={{ color: C.ink }}>
            Đáp án đúng của đề (không bắt buộc)
          </label>
          <textarea
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            placeholder={'VD: 1-B 2-C 3-A 4-D... hoặc liệt kê từng dòng.\nCó thì AI so khớp theo đúng đáp án này — chính xác hơn hẳn với bài CHƯA được chấm tay sẵn. Áp dụng chung cho cả xấp ảnh đang chấm (cùng 1 đề).'}
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer">
            <input
              type="file" accept="image/jpeg,image/png,image/webp" multiple
              className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
            />
            <span className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold" style={{ background: C.paper, color: C.ink, border: `1px solid ${C.line}` }}>
              + Thêm ảnh
            </span>
          </label>
          {rows.length > 0 && (
            <Btn kind="solid" onClick={gradeAll} disabled={running}>
              {running ? 'Đang chấm...' : `Chấm bằng AI (${rows.filter((r) => r.status === 'pending').length} ảnh chưa chấm)`}
            </Btn>
          )}
        </div>
      </Card>

      {rows.map((row) => {
        const cls = row.classIndex >= 0 ? data.classes[row.classIndex] : null
        const comps = cls ? scoreComps(cls) : []
        return (
          <Card key={row.id} className="p-4">
            <div className="flex gap-3">
              <img src={row.previewUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" style={{ border: `1px solid ${C.line}` }} />
              <div className="flex-1 min-w-0 space-y-2">
                {row.status === 'pending' && <div className="text-sm" style={{ color: C.muted }}>Chưa chấm</div>}
                {row.status === 'grading' && <div className="text-sm" style={{ color: C.muted }}>Đang đọc ảnh...</div>}
                {row.status === 'error' && (
                  <div className="text-sm" style={{ color: C.red }}>{row.error}</div>
                )}

                {row.ai && row.status !== 'error' && (
                  <>
                    {row.ai.lowConfidence && (
                      <div className="text-xs rounded-lg px-2 py-1" style={{ background: C.gold + '28', color: '#7A5A05' }}>
                        ⚠ AI không chắc chắn hoàn toàn — kiểm tra kỹ trước khi lưu.
                      </div>
                    )}
                    <div
                      className="text-xs rounded-lg px-2 py-1 inline-block"
                      style={row.ai.fromExistingGrade
                        ? { background: C.emerald + '1f', color: '#0F5132' }
                        : { background: C.blue + '1f', color: '#1E3A8A' }}
                    >
                      {row.ai.fromExistingGrade
                        ? '✓ Đọc lại điểm cô đã chấm sẵn trên bài — đáng tin hơn'
                        : 'ℹ AI tự chấm từ đầu (bài chưa thấy dấu chấm điểm) — nên xem kỹ hơn'}
                    </div>
                    {!row.ai.fromExistingGrade && row.usedAnswerKey && (
                      <div className="text-xs rounded-lg px-2 py-1 inline-block" style={{ background: C.emerald + '1f', color: '#0F5132' }}>
                        ✓ Đã so theo đáp án mẫu bạn cung cấp
                      </div>
                    )}
                    <div className="text-xs" style={{ color: C.muted }}>AI đọc tên: “{row.ai.studentName || '(không thấy)'}”</div>

                    <select
                      className="w-full rounded-xl px-3 py-2 text-sm"
                      style={{ border: `1px solid ${C.line}` }}
                      value={row.studentId ? `${row.classIndex}:${row.studentId}` : ''}
                      onChange={(e) => {
                        const [ciStr, sid] = e.target.value.split(':')
                        const ci = Number(ciStr)
                        const m = { classIndex: ci, studentId: sid } as StudentMatch
                        patch(row.id, (r) => applyMatch(r, e.target.value ? m : undefined))
                      }}
                    >
                      <option value="">— Chọn học sinh —</option>
                      {(row.matches.length ? row.matches.map((m) => ({ classIndex: m.classIndex, className: m.className, studentId: m.studentId, studentName: m.studentName })) : allStudents).map((m) => (
                        <option key={`${m.classIndex}:${m.studentId}`} value={`${m.classIndex}:${m.studentId}`}>
                          {m.studentName} — {m.className}
                        </option>
                      ))}
                    </select>
                    {row.matches.length > 1 && (
                      <div className="text-xs" style={{ color: C.gold }}>Có {row.matches.length} em trùng tên — chọn đúng em.</div>
                    )}

                    {cls && (
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date" value={row.date}
                          onChange={(e) => patch(row.id, (r) => { r.date = e.target.value })}
                          className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}
                        />
                        {comps.length ? (
                          <select
                            value={row.compKey}
                            onChange={(e) => patch(row.id, (r) => { r.compKey = e.target.value })}
                            className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}
                          >
                            {comps.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs self-center" style={{ color: C.red }}>
                            Lớp {cls.name} không có tiêu chí dạng điểm số — chấm tay ở Nhập điểm.
                          </span>
                        )}
                        <input
                          type="number" min={0} value={row.rawScore}
                          onChange={(e) => patch(row.id, (r) => { r.rawScore = Number(e.target.value) })}
                          className="w-20 rounded-xl px-3 py-2 text-sm text-right" style={{ border: `1px solid ${C.line}` }}
                        />
                        <span className="self-center text-sm" style={{ color: C.muted }}>/</span>
                        <input
                          type="number" min={0} value={row.rawMax}
                          onChange={(e) => patch(row.id, (r) => { r.rawMax = Number(e.target.value) })}
                          className="w-20 rounded-xl px-3 py-2 text-sm text-right" style={{ border: `1px solid ${C.line}` }}
                        />
                        <span className="self-center text-sm" style={{ color: C.muted }}>câu — {viDate(row.date)}</span>
                      </div>
                    )}

                    {row.ai.errors.length > 0 && (
                      <div className="text-xs" style={{ color: C.muted }}>Lỗi AI thấy: {row.ai.errors.join(', ')}</div>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {(row.status === 'read' || row.status === 'saved') && (
                  <Btn
                    kind={row.status === 'saved' ? 'success' : 'solid'}
                    onClick={() => saveRow(row)}
                    disabled={!row.studentId || !row.compKey}
                  >
                    {row.status === 'saved' ? '✓ Đã lưu' : 'Lưu điểm'}
                  </Btn>
                )}
                {row.status === 'error' && (
                  <Btn kind="ghost" onClick={() => gradeOne(row)}>Chấm lại</Btn>
                )}
                <button className="text-xs" style={{ color: C.muted }} onClick={() => removeRow(row.id)}>Bỏ ảnh này</button>
              </div>
            </div>
          </Card>
        )
      })}

      {!rows.length && (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>
          Chưa có ảnh nào. Bấm “+ Thêm ảnh” để bắt đầu.
        </Card>
      )}
    </div>
  )
}
