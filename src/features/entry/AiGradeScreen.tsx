import { useRef, useState } from 'react'
import { produce } from 'immer'
import type { AppData, ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getClassRubric } from '@/constants/rubrics'
import { todayISO, viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { uid } from '@/utils/uid'
import { emptyEntry } from '@/business/seed'
import { sessionScore } from '@/business/scoring'
import { matchStudentsByName, normalizeViName, type StudentMatch } from '@/business/aiMatch'
import { matchAiErrorTags } from '@/business/aiErrorTags'
import { aiGradingService, type AiGradeResult } from '@/services/aiGrading'
import { AiSolveBox } from './AiSolveBox'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { studentService } from '@/services/students'
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
  // "Chấm kỹ hơn" — gọi AI thêm 1 lần ĐỘC LẬP cho đúng ảnh này để đối chiếu.
  // Không tự động, chỉ chạy khi giáo viên chủ động bấm (không phát sinh phí
  // ngoài ý muốn). agrees=true nghĩa là 2 lần AI đọc ra kết quả gần giống
  // nhau — đáng tin hơn; false nghĩa là 2 lần khác nhau — cần tự đọc kỹ.
  checking: boolean
  secondCheck?: { rawScore: number; rawMax: number; studentName: string; agrees: boolean }
  // File PDF không hiện được bằng thẻ <img> — hiện icon thay vì ảnh xem trước.
  isPdf: boolean
  // Bài AI khuyến nghị chấm tay (chữ quá xấu) — giáo viên phải chủ động tick
  // xác nhận đã tự xem ảnh gốc thì mới bấm "Lưu điểm" được, tránh lỡ tay lưu
  // điểm AI đoán vào 1 bài đáng ra phải tự chấm.
  confirmManualOverride: boolean
  // true = đang hiện dropdown chọn học sinh tay (mặc định false khi AI khớp
  // chắc chắn đúng 1 em — lúc đó chỉ hiện banner xác nhận cho gọn, bấm "Đổi
  // khác" mới mở dropdown ra).
  showPicker: boolean
  // Bản nháp ô "Ghi chú nét chữ" của học sinh đã khớp — tách khỏi giá trị đã
  // lưu để gõ mượt (input có kiểm soát), chỉ ghi thật khi bấm Lưu.
  noteDraft: string
  savingNote: boolean
  // Ghi chú TỰ DO của giáo viên cho ĐÚNG lần chấm này (khác ghi chú nét chữ —
  // cái đó gắn với học sinh, dùng lại mãi; cái này gắn với 1 lần chấm cụ
  // thể) — lưu vào ô "note" của điểm khi bấm Lưu điểm.
  myNote: string
  // Chi tiết từng câu AI tự chấm (rỗng nếu AI chỉ đọc lại điểm tổng có sẵn,
  // xem fromExistingGrade) — giáo viên SỬA TRỰC TIẾP đáp án/đúng-sai của
  // từng câu ngay tại đây khi chữ quá xấu AI đọc sai, rawScore/rawMax phía
  // trên TỰ TÍNH LẠI theo danh sách này, không cần gõ lại số tổng tay.
  questions: Array<{ no: string; studentAnswer: string; correct: boolean; uncertain: boolean }>
  // Đang hiện ảnh gốc kèm ghim ghi chú tại đúng khu vực AI nghi ngờ hay không
  // — mặc định ẩn (ảnh to chiếm nhiều chỗ), bấm nút mới hiện ra.
  showAnnotated: boolean
  // Giáo viên CHỦ ĐỘNG tick chọn lưu lại ảnh gốc làm bằng chứng/hồ sơ — mặc
  // định TẮT (ảnh KHÔNG được lưu trừ khi tick ô này), tự xóa sau 30 ngày.
  // Chỉ áp dụng cho ẢNH thường, không áp dụng cho PDF.
  saveOriginal: boolean
  savingOriginal: boolean
}

function newRow(file: File): Row {
  const isPdf = file.type === 'application/pdf'
  return {
    // Luôn tạo previewUrl kể cả PDF — dùng để bấm mở xem to (trình duyệt tự
    // hiển thị PDF trong tab mới), chỉ riêng thẻ <img> mới không hiển thị
    // được PDF nên phần đó vẫn phải dùng icon thay thế.
    id: uid(), file, previewUrl: URL.createObjectURL(file), status: 'pending',
    matches: [], studentId: '', classIndex: -1, date: todayISO(), compKey: '',
    rawScore: 0, rawMax: 0, usedAnswerKey: false, checking: false, isPdf,
    noteDraft: '', savingNote: false, myNote: '',
    confirmManualOverride: false, showPicker: false, questions: [], showAnnotated: false,
    saveOriginal: false, savingOriginal: false,
  }
}

/** Tiêu chí AI điền được — chỉ hỗ trợ dạng "score" (1 con số, VD Mini Test,
 *  Listening). Các dạng khác (ticks/parts/choice — BTVN, video bài nói...)
 *  cần đánh giá theo hành vi/nộp bài thật, không suy ra được từ 1 ảnh đề. */
function scoreComps(cls: ClassData) {
  return getClassRubric(cls).comps.filter((c) => c.type === 'score')
}

/** 1 chỗ AI đang nghi ngờ — hiện sẵn vài phương án AI đoán được (bấm chọn
 *  nhanh) và 1 ô để giáo viên tự gõ nếu không phương án nào đúng. Xác nhận
 *  xong thì ghi lại thành công (không tự sửa điểm — chỉ lưu lại làm bằng
 *  chứng/ghi chú, giáo viên vẫn tự quyết định điểm cuối ở ô Điểm bên trên). */
function AmbiguousItemRow({
  item, index, onConfirm,
}: {
  item: { description: string; suggestions: string[] }
  index: number
  onConfirm: (answer: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [confirmed, setConfirmed] = useState('')

  if (confirmed) {
    return (
      <li className="flex items-center justify-between gap-2" style={{ color: C.emerald }}>
        <span>✓ {item.description} — đã ghi: “{confirmed}”</span>
        <button
          type="button"
          className="shrink-0 text-xs underline"
          style={{ color: C.muted }}
          onClick={() => { setDraft(confirmed); setConfirmed('') }}
        >
          ✎ Sửa lại
        </button>
      </li>
    )
  }
  return (
    <li className="space-y-1">
      <div>
        <span
          className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: C.gold, color: '#1C0F00' }}
        >
          {index + 1}
        </span>
        {item.description}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {item.suggestions.map((s, i) => (
          <button
            key={i} type="button"
            onClick={() => { onConfirm(s); setConfirmed(s) }}
            className="rounded-lg px-2 py-1 text-xs font-semibold"
            style={{ background: '#fff', border: `1px solid ${C.gold}`, color: '#7A5A05' }}
          >
            {s}
          </button>
        ))}
        <input
          type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Tự gõ đáp án đúng..."
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-xs"
          style={{ border: `1px solid ${C.line}` }}
        />
        <button
          type="button"
          onClick={() => { if (draft.trim()) { onConfirm(draft.trim()); setConfirmed(draft.trim()) } }}
          className="rounded-lg px-2 py-1 text-xs font-semibold"
          style={{ background: C.board2, color: '#fff' }}
        >
          ✓ Xác nhận
        </button>
      </div>
    </li>
  )
}

/** Hiện ảnh gốc kèm GHIM GHI CHÚ tại đúng khu vực AI đang nghi ngờ (đánh số
 *  khớp với danh sách bên dưới) — vị trí ghim là ƯỚC LƯỢNG (AI không định vị
 *  pixel chính xác), không thay thế được việc đọc mô tả bằng chữ, chỉ giúp
 *  nhìn nhanh ra đúng khu vực cần xem kỹ hơn trên ảnh gốc. Chỉ dùng cho ẢNH
 *  (PDF không ghim được vì có thể nhiều trang, không có 1 khung ảnh duy nhất). */
function AnnotatedImage({
  src, items,
}: {
  src: string
  items: Array<{ description: string; position: { x: number; y: number } }>
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ border: `1px solid ${C.line}` }}>
      <img src={src} alt="" className="block w-full select-none" />
      {items.map((it, i) => {
        const flip = it.position.x > 60
        return (
          <div
            key={i}
            className="absolute flex items-center gap-1"
            style={{
              left: `${it.position.x}%`, top: `${it.position.y}%`,
              transform: `translate(${flip ? '-100%' : '0%'}, -50%)`,
              flexDirection: flip ? 'row-reverse' : 'row',
            }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: C.gold, color: '#1C0F00', border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,.4)' }}
            >
              {i + 1}
            </span>
            <span
              className="max-w-[140px] rounded px-1.5 py-0.5 text-[10px] leading-tight"
              style={{ background: 'rgba(255,255,255,.95)', color: '#7A5A05', border: `1px solid ${C.gold}` }}
            >
              {it.description}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AiGradeScreen({ data, setData }: AiGradeScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  // Đáp án đúng của đề — áp dụng chung cho cả lượt chấm (giáo viên thường
  // quét cả xấp bài CÙNG 1 đề). Không bắt buộc, giúp AI so khớp chính xác
  // hơn với bài CHƯA được chấm tay sẵn, thay vì tự đoán đáp án đúng.
  const [answerKey, setAnswerKey] = useState('')
  // Lớp áp dụng — không bắt buộc. Nếu chọn, chỉ tìm tên trong đúng lớp đó,
  // giảm rủi ro trùng tên giữa các lớp khác nhau. Để trống thì tìm khắp mọi
  // lớp như trước (giáo viên không cần biết trước là lớp nào).
  const [targetClassId, setTargetClassId] = useState('')

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
      row.noteDraft = cls.students.find((s) => s.id === m.studentId)?.handwritingNote ?? ''
    } else {
      row.compKey = ''
      row.noteDraft = ''
    }
  }

  /** Khi "Chấm kỹ hơn" ra 2 kết quả khác nhau — giáo viên bấm chọn dùng kết
   *  quả nào, không chỉ đọc thông báo rồi tự loay hoay. Chọn lần 2 thì thay
   *  luôn điểm hiện tại bằng điểm lần 2; chọn lần 1 thì giữ nguyên, chỉ đóng
   *  banner lại — cả 2 trường hợp đều coi như đã xử lý xong cảnh báo. */
  function useSecondCheckResult(row: Row, which: 'first' | 'second') {
    patch(row.id, (r) => {
      if (which === 'second' && r.secondCheck) {
        r.rawScore = r.secondCheck.rawScore
        r.rawMax = r.secondCheck.rawMax
      }
      r.secondCheck = undefined
    })
  }

  /** Giáo viên xác nhận 1 chỗ AI đang nghi ngờ (bấm chọn phương án AI gợi ý,
   *  hoặc tự gõ) — ghi lại vào ô "Ghi chú của bạn" làm bằng chứng, KHÔNG tự
   *  sửa điểm (điểm vẫn do giáo viên tự quyết định ở ô Điểm bên trên). Xác
   *  nhận LẠI cho cùng 1 chỗ (sau khi bấm "✎ Sửa lại") THAY THẾ dòng cũ,
   *  không cộng dồn thành 2 dòng trùng nhau cho cùng 1 chỗ nghi ngờ. */
  function confirmAmbiguousItem(row: Row, description: string, answer: string) {
    const label = description.split(':')[0]
    const line = `${label}: ${answer}`
    patch(row.id, (r) => {
      const parts = r.myNote ? r.myNote.split('; ').filter((p) => !p.startsWith(`${label}:`)) : []
      parts.push(line)
      r.myNote = parts.join('; ')
    })
  }

  /** Giáo viên sửa lại 1 câu cụ thể (đáp án đọc sai vì chữ xấu, hoặc chấm
   *  nhầm đúng/sai) — rawScore/rawMax TỰ TÍNH LẠI ngay theo toàn bộ danh
   *  sách câu, hiện luôn cho giáo viên thấy điểm mới mà không cần tự cộng tay. */
  function updateQuestion(row: Row, index: number, fn: (q: Row['questions'][number]) => void) {
    patch(row.id, (r) => {
      fn(r.questions[index])
      r.rawScore = r.questions.filter((q) => q.correct).length
      r.rawMax = r.questions.length
    })
  }

  function removeQuestion(row: Row, index: number) {
    patch(row.id, (r) => {
      r.questions.splice(index, 1)
      r.rawScore = r.questions.filter((q) => q.correct).length
      r.rawMax = r.questions.length
    })
  }

  async function saveHandwritingNote(row: Row) {
    if (!row.studentId || !isMongoid(row.studentId)) {
      toast.error('Học sinh này chưa đồng bộ lên server — mở lại app rồi thử lại.')
      return
    }
    patch(row.id, (r) => { r.savingNote = true })
    try {
      await studentService.update(row.studentId, { handwritingNote: row.noteDraft.trim() })
      setData(produce((d: AppData) => {
        const st = d.classes[row.classIndex]?.students.find((s) => s.id === row.studentId)
        if (st) st.handwritingNote = row.noteDraft.trim()
      }))
      toast.success('Đã lưu ghi chú nét chữ.')
    } catch {
      toast.error('Lỗi khi lưu ghi chú — thử lại.')
    } finally {
      patch(row.id, (r) => { r.savingNote = false })
    }
  }

  async function gradeOne(row: Row) {
    patch(row.id, (r) => { r.status = 'grading'; r.error = undefined })
    const keyUsed = answerKey.trim()
    try {
      const ai = await aiGradingService.gradePhoto(row.file, keyUsed || undefined)
      const matches = ai.studentName
        ? matchStudentsByName(data.classes, ai.studentName, targetClassId || undefined)
        : []
      patch(row.id, (r) => {
        r.ai = ai
        r.matches = matches
        r.questions = ai.questions
        // Có danh sách từng câu thì tính rawScore/rawMax từ đó (khớp đúng cái
        // giáo viên đang thấy/sửa được), không thì dùng số tổng AI trả (VD
        // trường hợp fromExistingGrade=true chỉ có điểm viết sẵn, không tách
        // được từng câu).
        r.rawScore = ai.questions.length ? ai.questions.filter((q) => q.correct).length : ai.rawScore
        r.rawMax = ai.questions.length ? ai.questions.length : ai.rawMax
        r.usedAnswerKey = !!keyUsed
        // KHÔNG còn coi unreadable=true là "lỗi" (status='error') — AI vẫn
        // điền nội dung đọc được nhiều nhất có thể (xem SYSTEM_PROMPT), giáo
        // viên cần THẤY được nội dung đó để tự đối chiếu đáp án mẫu, không
        // phải bị ẩn sau 1 dòng lỗi chung chung. 'error' giờ chỉ dành cho lỗi
        // gọi API thật (xem catch bên dưới).
        r.status = 'read'
        r.showPicker = false
        r.confirmManualOverride = false
        r.showAnnotated = false
        applyMatch(r, matches.length === 1 ? matches[0] : undefined)
      })
    } catch (err) {
      const msg =
        (err as { response?: { status?: number; data?: { message?: string } } })?.response?.data?.message
        ?? 'Lỗi khi gọi AI — thử lại.'
      patch(row.id, (r) => { r.status = 'error'; r.error = msg })
    }
  }

  /** "Chấm kỹ hơn" — gọi AI thêm 1 lần độc lập cho đúng ảnh này (ảnh gửi ở
   *  độ phân giải cao hơn mức mặc định, giữ nhiều chi tiết chữ viết tay hơn),
   *  so với kết quả lần đầu. Chỉ chạy khi giáo viên chủ động bấm cho từng
   *  ảnh, không tự động cho cả xấp — tránh phát sinh phí ngoài ý muốn. */
  async function doubleCheck(row: Row) {
    if (!row.ai) return
    patch(row.id, (r) => { r.checking = true })
    const keyUsed = answerKey.trim()
    // Ghi chú nét chữ của ĐÚNG em đã được xác định (nếu có) — chỉ dùng được
    // ở đây vì lúc này đã biết chắc là em nào, khác với lượt chấm đầu tiên.
    const note = row.classIndex >= 0
      ? data.classes[row.classIndex]?.students.find((s) => s.id === row.studentId)?.handwritingNote
      : undefined
    try {
      const second = await aiGradingService.gradePhoto(row.file, keyUsed || undefined, true, note)
      const pct1 = row.rawMax > 0 ? row.rawScore / row.rawMax : 0
      const pct2 = second.rawMax > 0 ? second.rawScore / second.rawMax : 0
      const sameName = normalizeViName(second.studentName) === normalizeViName(row.ai.studentName)
      // Coi là "khớp nhau" nếu tên giống và điểm % chênh không quá 5 điểm —
      // sai khác nhỏ do làm tròn thì vẫn tính là khớp, không báo động giả.
      const agrees = sameName && Math.abs(pct1 - pct2) * 100 <= 5
      patch(row.id, (r) => {
        r.checking = false
        r.secondCheck = { rawScore: second.rawScore, rawMax: second.rawMax, studentName: second.studentName, agrees }
      })
    } catch {
      patch(row.id, (r) => { r.checking = false })
      toast.error('Lỗi khi chấm kỹ hơn — thử lại.')
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
      // Ghi chú của bạn (nếu có gõ) LUÔN được lưu, kể cả buổi đã có sẵn — vì
      // bạn chủ động gõ ngay lúc này, không phải suy luận tự động như lỗi AI
      // thấy (chỉ điền tự động lần đầu, không ghi đè ghi chú cũ đã có).
      if (row.myNote.trim()) {
        entry.note = entry.note ? `${entry.note}; ${row.myNote.trim()}` : row.myNote.trim()
      } else if (isNew && row.ai?.errors.length) {
        entry.note = row.ai.errors.join(', ')
      }

      // Lỗi AI phát hiện khi chấm ảnh — đối chiếu với tag có sẵn của ĐÚNG
      // tiêu chí đang chấm (chỉ Mini Test/Listening có hệ tag lỗi kiểu này),
      // gộp thêm vào tag đã có của buổi (không ghi đè) — để "lỗi lặp lại" ở
      // Báo cáo/nhận xét tự động cũng tính luôn lỗi AI thấy, không chỉ lỗi
      // giáo viên tự chọn tay ở Nhập điểm.
      if (row.ai?.errors.length) {
        const matched = matchAiErrorTags(row.ai.errors, row.compKey)
        if (matched.length) {
          const existing = entry.tags[row.compKey] ?? []
          entry.tags = { ...entry.tags, [row.compKey]: [...new Set([...existing, ...matched])] }
        }
      }

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

      // Lưu ảnh gốc làm bằng chứng — CHỈ khi giáo viên chủ động tick, không
      // tự động. Best-effort: lỗi ở bước này không được phép làm mất điểm
      // vừa lưu thành công ở trên, chỉ báo riêng.
      if (row.saveOriginal && !row.isPdf) {
        patch(row.id, (r2) => { r2.savingOriginal = true })
        try {
          await aiGradingService.savePhoto(row.file, cls.id, student.id)
          toast.success('Đã lưu ảnh gốc — tự xóa sau 30 ngày.')
        } catch {
          toast.error('Lưu điểm thành công nhưng lưu ảnh gốc bị lỗi — thử tick lại.')
        } finally {
          patch(row.id, (r2) => { r2.savingOriginal = false })
        }
      }
    } catch {
      patch(row.id, (r2) => { r2.status = 'error'; r2.error = 'Lỗi khi lưu điểm — thử lại.' })
    }
  }

  const allStudents = data.classes.flatMap((c, ci) =>
    c.students.map((s) => ({ classIndex: ci, className: c.name, studentId: s.id, studentName: s.name })),
  )

  // Sắp xếp LẠI CHỈ ĐỂ HIỂN THỊ (không đổi thứ tự lưu trong `rows`) — bài rõ
  // ràng lên trước để duyệt nhanh, bài khó đọc/không đọc được dồn xuống dưới
  // để giáo viên để ý kỹ hơn. Chỉ biết được độ khó đọc SAU KHI đã chấm, nên
  // không thể sắp trước khi chấm — bài chưa chấm giữ nguyên vị trí giữa.
  function rowPriority(r: Row): number {
    if (r.status === 'pending' || r.status === 'grading') return 1
    if (r.status === 'error') return 4
    if (r.ai && !r.ai.fromExistingGrade && (r.ai.needsManualGrading || r.ai.unreadable)) return 3
    if (r.ai?.lowConfidence) return 2
    return 0
  }
  const displayRows = [...rows].sort((a, b) => rowPriority(a) - rowPriority(b))

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
        <hr style={{ borderColor: C.line }} />

        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: C.board, color: '#fff' }}>1</span>
            <label className="text-sm font-semibold" style={{ color: C.ink }}>Thêm ảnh hoặc file PDF bài kiểm tra</label>
          </div>
          <input
            ref={fileInputRef}
            type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
            className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold"
            style={{ background: C.paper, color: C.ink, border: `1px solid ${C.line}` }}
          >
            + Thêm ảnh/PDF
          </button>
        </div>

        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: C.paper, color: C.muted, border: `1px solid ${C.line}` }}>2</span>
            <label className="text-sm font-semibold" style={{ color: C.ink }}>Lớp áp dụng (không bắt buộc)</label>
          </div>
          <select
            value={targetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          >
            <option value="">— Tự tìm khắp mọi lớp (mặc định) —</option>
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            Nếu biết chắc cả xấp ảnh đang chấm là cùng 1 lớp, chọn đúng lớp đó — giảm rủi ro trùng tên giữa các
            lớp khác nhau. Để trống thì AI vẫn tự tìm khắp mọi lớp như trước.
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: C.paper, color: C.muted, border: `1px solid ${C.line}` }}>3</span>
              <label className="text-sm font-semibold" style={{ color: C.ink }}>Đáp án đúng của đề (không bắt buộc)</label>
            </div>
            {answerKey.trim() && (
              <span className="text-xs" style={{ color: C.emerald }}>
                ✓ Đã có {answerKey.trim().split(/\s+/).length} mục
              </span>
            )}
          </div>
          <div className="text-xs" style={{ color: C.muted }}>
            Gõ tay kiểu "1-B 2-C 3-A..." hoặc liệt kê từng dòng, hoặc bấm "Giải đề mẫu bằng AI" bên dưới để AI tự
            điền vào đây — có đáp án thì chấm chính xác hơn hẳn với bài CHƯA chấm tay sẵn.
          </div>
          <textarea
            value={answerKey}
            onChange={(e) => setAnswerKey(e.target.value)}
            placeholder={'1-B 2-C 3-A 4-D 5-C...\nhoặc\n1. is read\n2. was punished\n...'}
            rows={10}
            className="w-full resize-y rounded-xl px-3 py-2.5 text-sm leading-relaxed"
            style={{ border: `1.5px solid ${C.line}`, background: '#FBFCFE', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: 200 }}
          />
          <AiSolveBox onSolved={setAnswerKey} />
        </div>

        {rows.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: C.gold, color: '#1C0F00' }}>4</span>
              <label className="text-sm font-semibold" style={{ color: C.ink }}>Bấm chấm — làm sau khi đã thêm đủ ảnh</label>
            </div>
            <Btn kind="solid" onClick={gradeAll} disabled={running}>
              {running ? 'Đang chấm...' : `Chấm bằng AI (${rows.filter((r) => r.status === 'pending').length} ảnh chưa chấm)`}
            </Btn>
          </div>
        )}
      </Card>

      {displayRows.map((row) => {
        const cls = row.classIndex >= 0 ? data.classes[row.classIndex] : null
        const comps = cls ? scoreComps(cls) : []
        // Bài chưa chấm sẵn + (AI đánh giá chữ quá xấu HOẶC không đủ căn cứ ra
        // điểm đáng tin) — mức cảnh báo NẶNG hơn lowConfidence, bắt giáo viên
        // tick xác nhận mới cho lưu, tránh lỡ tay dùng điểm AI đoán cho bài
        // đáng ra phải tự chấm. Nội dung AI đọc được (questions/ambiguousItems)
        // vẫn hiện đầy đủ bên dưới dù rơi vào trường hợp này — không bị ẩn.
        const needsManual = !!(row.ai && !row.ai.fromExistingGrade && (row.ai.needsManualGrading || row.ai.unreadable))
        // Khớp đúng 1 em VÀ tên đủ rõ (in sẵn hoặc chữ viết tay rất rõ) — chỉ
        // cần giáo viên xác nhận 1 cái, không bắt tự chọn lại từ dropdown.
        const autoMatched = row.matches.length === 1 && row.ai?.nameConfidence === 'high' && !row.showPicker
        return (
          <Card key={row.id} className="p-4">
            <div className="flex gap-3">
              <a
                href={row.previewUrl} target="_blank" rel="noreferrer"
                title="Bấm để xem ảnh gốc to hơn (mở tab mới)"
                className="relative block h-24 w-24 shrink-0"
              >
                {row.isPdf ? (
                  <div
                    className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold"
                    style={{ border: `1px solid ${C.line}`, background: C.paper, color: C.muted }}
                  >
                    <span className="text-2xl">📄</span>
                    PDF
                  </div>
                ) : (
                  <img src={row.previewUrl} alt="" className="h-24 w-24 rounded-lg object-cover" style={{ border: `1px solid ${C.line}` }} />
                )}
                <span
                  className="absolute inset-x-0 bottom-0 rounded-b-lg py-0.5 text-center text-[10px] font-semibold text-white"
                  style={{ background: 'rgba(15,23,42,.65)' }}
                >
                  🔍 Xem to
                </span>
              </a>
              <div className="flex-1 min-w-0 space-y-2">
                {row.status === 'pending' && <div className="text-sm" style={{ color: C.muted }}>Chưa chấm</div>}
                {row.status === 'grading' && <div className="text-sm" style={{ color: C.muted }}>Đang đọc ảnh...</div>}
                {row.status === 'error' && (
                  <div className="text-sm" style={{ color: C.red }}>{row.error}</div>
                )}

                {row.ai && row.status !== 'error' && (
                  <>
                    {row.ai.testTitle && (
                      <div
                        className="text-xs rounded-lg px-2 py-1"
                        style={row.ai.nameConfidence === 'low'
                          ? { background: C.blue + '1f', color: '#1E3A8A', fontWeight: 600 }
                          : { color: C.muted }}
                      >
                        📄 Đề: {row.ai.testTitle}
                        {row.ai.nameConfidence === 'low' && ' — chữ in sẵn, tham khảo để xác định đúng bài/lớp vì tên viết tay không rõ'}
                      </div>
                    )}
                    {needsManual && (
                      <div className="text-xs rounded-lg px-2 py-2 font-semibold" style={{ background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
                        {row.ai.unreadable ? (
                          <>
                            🖐️ AI KHÔNG đủ căn cứ để tính ra điểm đáng tin cho bài này — nhưng vẫn đọc được phần nào,
                            xem "Từng câu" bên dưới để TỰ ĐỐI CHIẾU với đáp án mẫu và chấm tay.
                          </>
                        ) : (
                          <>
                            🖐️ AI đề nghị CHẤM TAY bài này — {row.ai.manualGradingReason || 'chữ viết khó đọc, không đủ tin cậy để tự chấm.'}
                            {' '}Nên tách ảnh này ra, tự xem bản gốc và chấm ở màn Nhập điểm.
                          </>
                        )}
                      </div>
                    )}
                    {row.ai.lowConfidence && !needsManual && (
                      <div className="text-xs rounded-lg px-2 py-1" style={{ background: C.gold + '28', color: '#7A5A05' }}>
                        ⚠ AI không chắc chắn hoàn toàn — kiểm tra kỹ trước khi lưu.
                      </div>
                    )}
                    {row.ai.ambiguousItems.length > 0 && (
                      <div className="text-xs rounded-lg px-2 py-2" style={{ background: C.gold + '14', color: '#7A5A05', border: `1px solid ${C.gold}40` }}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <b>Đúng chỗ cần bạn xem lại — bấm phương án đúng hoặc tự gõ:</b>
                          {!row.isPdf && (
                            <button
                              type="button"
                              className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold"
                              style={{ background: '#fff', border: `1px solid ${C.gold}`, color: '#7A5A05' }}
                              onClick={() => patch(row.id, (r) => { r.showAnnotated = !r.showAnnotated })}
                            >
                              {row.showAnnotated ? '✕ Ẩn ảnh ghim ghi chú' : '📍 Xem ảnh ghim ghi chú'}
                            </button>
                          )}
                        </div>
                        {row.showAnnotated && !row.isPdf && (
                          <div className="mb-2 space-y-1">
                            <AnnotatedImage src={row.previewUrl} items={row.ai.ambiguousItems} />
                            <div className="text-[10px]" style={{ color: C.muted }}>
                              Vị trí ghim là ƯỚC LƯỢNG, có thể lệch đôi chút — đọc mô tả bằng chữ bên dưới để chắc chắn.
                            </div>
                          </div>
                        )}
                        <ul className="space-y-2">
                          {row.ai.ambiguousItems.map((it, i) => (
                            <AmbiguousItemRow key={i} item={it} index={i} onConfirm={(ans) => confirmAmbiguousItem(row, it.description, ans)} />
                          ))}
                        </ul>
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
                    <div className="text-xs" style={{ color: C.muted }}>
                      AI đọc tên: “{row.ai.studentName || '(không thấy)'}”
                      {row.ai.nameConfidence === 'high' && ' — tên rõ ràng'}
                    </div>

                    {autoMatched ? (
                      <div
                        className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
                        style={{ background: C.emerald + '14', border: `1px solid ${C.emerald}55`, color: '#0F5132' }}
                      >
                        <span>✓ Tự động khớp: <b>{row.matches[0].studentName}</b> — {row.matches[0].className}</span>
                        <button
                          type="button"
                          className="shrink-0 text-xs underline"
                          style={{ color: C.muted }}
                          onClick={() => patch(row.id, (r) => { r.showPicker = true })}
                        >
                          Đổi khác
                        </button>
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}

                    {row.studentId && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold" style={{ color: C.ink }}>
                          Ghi chú nét chữ của em này (không bắt buộc)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={row.noteDraft}
                            onChange={(e) => patch(row.id, (r) => { r.noteDraft = e.target.value })}
                            placeholder={'VD: hay viết "t" giống "l", số 5 giống 6...'}
                            className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          <Btn kind="ghost" size="sm" onClick={() => saveHandwritingNote(row)} disabled={row.savingNote}>
                            {row.savingNote ? 'Đang lưu...' : 'Lưu ghi chú'}
                          </Btn>
                        </div>
                        <div className="mt-1 text-xs" style={{ color: C.muted }}>
                          Dùng làm gợi ý cho AI ở nút "Chấm kỹ hơn" các lần sau của đúng em này — không lưu ảnh
                          nào cả, chỉ vài dòng chữ.
                        </div>
                      </div>
                    )}

                    {row.questions.length > 0 && (
                      <div className="space-y-1 rounded-lg p-2" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
                        <div className="text-xs font-semibold" style={{ color: C.ink }}>
                          Từng câu — sửa đáp án hoặc bấm Đúng/Sai nếu AI đọc nhầm (điểm bên dưới tự tính lại):
                        </div>
                        <div className="space-y-1">
                          {row.questions.map((q, qi) => (
                            <div
                              key={qi}
                              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                              style={q.uncertain
                                ? { background: C.gold + '1f', border: `1px solid ${C.gold}55` }
                                : { background: '#fff', border: `1px solid ${C.line}` }}
                              title={q.uncertain ? 'AI không chắc chắn đọc đúng chữ viết ở câu này' : undefined}
                            >
                              <span className="shrink-0 text-xs font-semibold" style={{ color: C.muted }}>{q.no}.</span>
                              <input
                                type="text" value={q.studentAnswer}
                                onChange={(e) => updateQuestion(row, qi, (x) => { x.studentAnswer = e.target.value })}
                                className="min-w-0 flex-1 rounded px-2 py-1 text-sm"
                                style={{ border: `1px solid ${C.line}` }}
                              />
                              <button
                                type="button"
                                onClick={() => updateQuestion(row, qi, (x) => { x.correct = !x.correct; x.uncertain = false })}
                                className="shrink-0 rounded px-2 py-1 text-xs font-semibold"
                                style={q.correct ? { background: C.emerald + '28', color: '#0F5132' } : { background: '#FEE2E2', color: '#991B1B' }}
                              >
                                {q.correct ? '✓ Đúng' : '✗ Sai'}
                              </button>
                              <button
                                type="button" title="Xoá câu này (không tính vào tổng)"
                                onClick={() => removeQuestion(row, qi)}
                                className="shrink-0 text-xs" style={{ color: C.muted }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
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

                    <div>
                      <label className="mb-1 block text-xs font-semibold" style={{ color: C.ink }}>
                        Ghi chú của bạn cho lần chấm này (không bắt buộc)
                      </label>
                      <input
                        type="text"
                        value={row.myNote}
                        onChange={(e) => patch(row.id, (r) => { r.myNote = e.target.value })}
                        placeholder="VD: đã xem lại ảnh gốc, điểm đúng như AI đọc..."
                        className="w-full rounded-xl px-3 py-2 text-sm"
                        style={{ border: `1px solid ${C.line}` }}
                      />
                      <div className="mt-1 text-xs" style={{ color: C.muted }}>Ghi vào cùng buổi học khi bạn bấm "Lưu điểm" bên dưới.</div>
                    </div>

                    {!row.isPdf && (
                      <label className="flex items-start gap-2 text-xs" style={{ color: C.ink }}>
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={row.saveOriginal}
                          onChange={(e) => patch(row.id, (r) => { r.saveOriginal = e.target.checked })}
                        />
                        <span>
                          📎 Lưu lại ảnh gốc làm bằng chứng/hồ sơ (tự xóa sau 30 ngày, chỉ giáo viên lớp này + admin xem
                          được) — lưu khi bạn bấm "Lưu điểm" bên dưới.
                        </span>
                      </label>
                    )}

                    {row.secondCheck && (
                      <div
                        className="rounded-lg px-2 py-2 text-xs"
                        style={row.secondCheck.agrees
                          ? { background: C.emerald + '1f', color: '#0F5132' }
                          : { background: '#FEE2E2', color: '#991B1B' }}
                      >
                        {row.secondCheck.agrees ? (
                          <div className="flex items-center justify-between gap-2">
                            <span>✓ Đã chấm kỹ hơn — lần 2 khớp ({row.secondCheck.rawScore}/{row.secondCheck.rawMax}), đáng tin hơn.</span>
                            <Btn kind="ghost" size="sm" onClick={() => useSecondCheckResult(row, 'first')}>Đã xem</Btn>
                          </div>
                        ) : (
                          <>
                            <div className="mb-1.5">
                              ⚠ 2 lần chấm ra kết quả KHÁC nhau, bạn chọn dùng kết quả nào — hoặc mở ảnh gốc để tự đọc:
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Btn kind="ghost" size="sm" onClick={() => useSecondCheckResult(row, 'first')}>
                                Dùng lần 1: {row.rawScore}/{row.rawMax}
                              </Btn>
                              <Btn kind="ghost" size="sm" onClick={() => useSecondCheckResult(row, 'second')}>
                                Dùng lần 2: {row.secondCheck.rawScore}/{row.secondCheck.rawMax} (tên "{row.secondCheck.studentName || '?'}")
                              </Btn>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {(row.ai.lowConfidence || needsManual || row.ai.ambiguousItems.length > 0) && !row.secondCheck && (
                      <Btn kind="ghost" size="sm" onClick={() => doubleCheck(row)} disabled={row.checking}>
                        {row.checking ? 'Đang chấm kỹ hơn...' : '🔍 Chấm kỹ hơn (gọi AI thêm 1 lần)'}
                      </Btn>
                    )}
                    {needsManual && (
                      <label className="flex items-start gap-2 text-xs" style={{ color: '#991B1B' }}>
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={row.confirmManualOverride}
                          onChange={(e) => patch(row.id, (r) => { r.confirmManualOverride = e.target.checked })}
                        />
                        <span>Tôi đã tự xem ảnh gốc và xác nhận điểm này đúng (bỏ qua khuyến nghị chấm tay).</span>
                      </label>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {(row.status === 'read' || row.status === 'saved') && (
                  <Btn
                    kind={row.status === 'saved' ? 'success' : 'solid'}
                    onClick={() => saveRow(row)}
                    disabled={!row.studentId || !row.compKey || (needsManual && !row.confirmManualOverride)}
                  >
                    {row.savingOriginal ? 'Đang lưu ảnh...' : row.status === 'saved' ? '✓ Đã lưu' : 'Lưu điểm'}
                  </Btn>
                )}
                {(row.status === 'error' || row.status === 'read' || row.status === 'saved') && (
                  <Btn kind="ghost" onClick={() => gradeOne(row)}>🔄 Chấm lại từ đầu</Btn>
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
