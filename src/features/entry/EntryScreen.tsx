import { useEffect, useState } from 'react'
import type { ClassData, Session, SessionEntry } from '@/types'
import { C, scoreColor, tabColor } from '@/constants/colors'
import { Icon } from '@/components/atoms/Icon'
import { ATTEND } from '@/constants/tags'
import { getClassRubric } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { todayISO, viDate } from '@/utils/format'
import { sessionScore, rescaleComp, detectMissingComps } from '@/business/scoring'
import { emptyEntry } from '@/business/seed'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { Pick } from '@/components/atoms/Pick'
import { ProgressBar } from '@/components/atoms/ProgressBar'
import { CompEditor } from '@/components/molecules/CompEditor'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { isMongoid } from '@/utils/mongoid'
import { logActivity } from '@/services/activity'
import { toast } from '@/store/toastStore'

interface EntryScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
  teacherName?: string
  /** Nhảy tới đúng học sinh + buổi này khi mở từ màn khác (VD "Thống kê
   *  buổi" bấm "Sửa điểm") — chỉ áp dụng 1 lần lúc mở màn. */
  initialTarget?: { studentId: string; no: number } | null
  onConsumeInitialTarget?: () => void
}

const FIELDS = ['scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev'] as const

const cloneEntry = (e: SessionEntry): SessionEntry =>
  JSON.parse(JSON.stringify(e)) as SessionEntry

// Nhớ lại "đang xem buổi mấy, học sinh nào" theo từng lớp — F5 tải lại
// trang không còn bị nhảy về Buổi 1/học sinh đầu tiên như trước.
const viewStorageKey = (classId: string) => `entry-view:${classId}`

interface PersistedView {
  noByStudent?: Record<string, number>
  cur?: number
}

function loadPersistedView(classId: string): PersistedView {
  try {
    const raw = localStorage.getItem(viewStorageKey(classId))
    return raw ? (JSON.parse(raw) as PersistedView) : {}
  } catch {
    return {}
  }
}

/** Buổi mặc định của 1 học sinh = số buổi lớn nhất em đó đã có (buổi gần nhất
 *  đã chấm), hoặc Buổi 1 nếu chưa có buổi nào. Mỗi học sinh có chuỗi buổi
 *  RIÊNG nên số buổi đang xem cũng phải riêng từng em — không dùng chung cả lớp. */
function defaultNoFor(student: { sessions: { no: number }[] } | undefined): number {
  const nos = student?.sessions.map((ss) => ss.no) ?? []
  return nos.length ? Math.max(...nos) : 1
}

/** Tìm buổi số N của đúng học sinh này; nếu chưa có thì tạo mới với ngày
 *  `dateForNew` (chỉ ở local — đẩy lên server xảy ra khi lưu điểm, xem
 *  syncScore). Buổi số là do giáo viên CHỌN, không tự tăng theo thứ tự
 *  nhập — vì học sinh có thể vào học trễ/sớm hơn ngày chung của lớp, hoặc
 *  giáo viên cần nhập bù 1 buổi cũ theo đúng số buổi của nó. */
function findOrCreateSession(c: ClassData, studentId: string, no: number, dateForNew: string, teacherName?: string): Session {
  const student = c.students.find((s) => s.id === studentId)!
  let session = student.sessions.find((s) => s.no === no)
  if (!session) {
    // Kế thừa "Số câu" đã đặt cho buổi này ở học sinh khác (nếu có) — để cả
    // lớp nhất quán mà KHÔNG cần tạo sẵn buổi (với điểm danh mặc định) cho
    // mọi học sinh ngay khi chỉ 1 người sửa ô "Số câu".
    const siblingMaxes = c.students.flatMap((s) => s.sessions).find((s) => s.no === no)?.maxes
    session = {
      id: uid(), no, date: dateForNew, homework: '', entry: emptyEntry(),
      createdByName: teacherName, recordedAt: new Date().toISOString(),
      maxes: siblingMaxes ? { ...siblingMaxes } : undefined,
    }
    student.sessions.push(session)
    student.sessions.sort((a, b) => a.no - b.no)
  }
  return session
}

export function EntryScreen({ cls, update, teacherName, initialTarget, onConsumeInitialTarget }: EntryScreenProps) {
  const r = getClassRubric(cls)
  // Số buổi đang xem của TỪNG học sinh (chỉ lưu những em đã được chọn buổi
  // khác mặc định). Đổi buổi ở 1 em không được làm cả lớp nhảy theo.
  const [noByStudent, setNoByStudent] = useState<Record<string, number>>(() => {
    const persisted = loadPersistedView(cls.id).noByStudent ?? {}
    if (initialTarget) return { ...persisted, [initialTarget.studentId]: initialTarget.no }
    return persisted
  })
  const [draftDate, setDraftDate] = useState(todayISO())
  const [cur, setCur] = useState(() => {
    if (initialTarget) {
      const idx = cls.students.findIndex((s) => s.id === initialTarget.studentId)
      return idx >= 0 ? idx : 0
    }
    const persisted = loadPersistedView(cls.id)
    if (persisted.cur != null && persisted.cur >= 0 && persisted.cur < cls.students.length) return persisted.cur
    return 0
  })

  // Lưu lại "mỗi em đang xem buổi mấy, đang ở học sinh nào" mỗi khi đổi — để
  // F5 tải lại trang khôi phục đúng chỗ đang làm dở, không cần chọn lại.
  useEffect(() => {
    try {
      localStorage.setItem(viewStorageKey(cls.id), JSON.stringify({ noByStudent, cur }))
    } catch {
      // localStorage đầy/bị chặn — bỏ qua, không ảnh hưởng chức năng chính
    }
  }, [cls.id, noByStudent, cur])

  // Chỉ áp dụng initialTarget MỘT LẦN lúc mở màn — sau đó xóa đi để lần mở
  // tiếp theo (không qua "Sửa điểm") không bị nhảy tới chỗ cũ.
  useEffect(() => {
    if (initialTarget) onConsumeInitialTarget?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState({ done: 0, total: 0 })
  const [showSummary, setShowSummary] = useState(false)

  // Buổi/Ngày khóa mặc định — tránh đổi nhầm do chạm/cuộn màn hình, phải
  // chủ động bấm ✎ Sửa mới mở ra chỉnh được.
  const [editingWhen, setEditingWhen] = useState(false)

  // Hộp xác nhận trước khi lưu & chuyển học sinh khác (Trước/Tiếp theo/bấm
  // chọn học sinh) — cho giáo viên xem lại Buổi/Ngày/Điểm danh/Tổng điểm 1
  // lần cuối trước khi thao tác thật sự xảy ra, tránh bấm nhầm rồi "nhảy"
  // sang học sinh khác mà không để ý.
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null)
  const requestNav = (action: () => void) => setPendingNav(() => action)
  const confirmNav = () => { pendingNav?.(); setPendingNav(null) }
  const cancelNav = () => setPendingNav(null)

  // Group selection state
  const [groupMode, setGroupMode] = useState(false)
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set())

  // "Số câu" — bản nháp đang gõ, tách khỏi giá trị đã lưu để không bị nhảy
  // số cũ trở lại mỗi khi xóa hết ô để gõ số mới (input là controlled).
  const [maxDrafts, setMaxDrafts] = useState<Record<string, string>>({})

  // Đổi số Buổi CỦA BUỔI ĐANG XEM — sửa trực tiếp đúng bản ghi hiện có (giữ
  // nguyên điểm/bài tập/điểm danh đã chấm), khác với việc chọn số buổi khác
  // ở select bên trên (mở/tạo 1 buổi KHÁC, không di chuyển dữ liệu buổi cũ).
  const [renamingNo, setRenamingNo] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')

  const st = cls.students[cur]
  /** Số buổi đang xem của 1 học sinh bất kỳ (riêng từng em). */
  const noOf = (studentId: string): number => {
    const stored = noByStudent[studentId]
    if (stored != null) return stored
    return defaultNoFor(cls.students.find((s) => s.id === studentId))
  }
  const selectedNo = st ? noOf(st.id) : 1
  /** Đổi buổi đang xem CHỈ của học sinh hiện tại. */
  const setSelectedNo = (no: number) => {
    if (!st) return
    setNoByStudent((prev) => ({ ...prev, [st.id]: no }))
  }
  const session = st?.sessions.find((s) => s.no === selectedNo)
  const effectiveDate = session?.date ?? draftDate
  const e = session?.entry ?? emptyEntry()

  function handleDateChange(newDate: string) {
    if (session) {
      update((c) => {
        const stu = c.students.find((s) => s.id === st?.id)
        const ss = stu?.sessions.find((y) => y.id === session.id)
        if (ss) ss.date = newDate
      })
      if (isMongoid(session.id)) {
        sessionService.update(session.id, { scheduledAt: `${newDate}T00:00:00.000Z` }).catch(() => {})
      }
    } else {
      setDraftDate(newDate)
    }
  }

  /** Đổi số Buổi của buổi ĐANG CÓ (session hiện tại) sang số khác — sửa
   *  đúng bản ghi đó (giữ nguyên điểm/bài tập/điểm danh), rồi theo dõi luôn
   *  sang số mới. Chặn nếu học sinh này đã có sẵn 1 buổi khác trùng số. */
  function commitRenameSessionNo() {
    if (!st || !session) return
    const newNo = Number(renameDraft)
    if (!renameDraft.trim() || !Number.isFinite(newNo) || newNo < 1) {
      toast.error('Số buổi không hợp lệ')
      return
    }
    if (newNo === session.no) {
      setRenamingNo(false)
      return
    }
    if (st.sessions.some((s) => s.id !== session.id && s.no === newNo)) {
      toast.error(`${st.name} đã có sẵn Buổi ${newNo} rồi — chọn số khác.`)
      return
    }
    const oldNo = session.no
    const sessionId = session.id
    const studentId = st.id
    update((c) => {
      const stu = c.students.find((s) => s.id === studentId)
      const found = stu?.sessions.find((s) => s.id === sessionId)
      if (found) found.no = newNo
      stu?.sessions.sort((a, b) => a.no - b.no)
    })
    if (isMongoid(sessionId)) {
      sessionService.update(sessionId, { lessonNo: newNo }).catch(() => {
        toast.error(`Lỗi khi lưu số Buổi mới lên server — đã khôi phục số cũ`, { persist: true })
        update((c) => {
          const stu = c.students.find((s) => s.id === studentId)
          const found = stu?.sessions.find((s) => s.id === sessionId)
          if (found) found.no = oldNo
          stu?.sessions.sort((a, b) => a.no - b.no)
        })
      })
    }
    setSelectedNo(newNo)
    setRenamingNo(false)
    setRenameDraft('')
    toast.success(`Đã đổi Buổi ${oldNo} → Buổi ${newNo} cho ${st.name} — điểm/bài tập vẫn giữ nguyên`)
  }

  const maxNo = Math.max(
    cls.perMonth,
    selectedNo,
    ...cls.students.flatMap((s) => s.sessions.map((ss) => ss.no)),
  )

  // Session-level overrides (comp max + ratio totals) — áp dụng cho ngày đang chọn
  const sessionMaxes = session?.maxes ?? {}
  const effectiveComps = r.comps.map((c) =>
    sessionMaxes[c.key] != null ? rescaleComp(c, sessionMaxes[c.key]) : c,
  )
  const r2 = { ...r, comps: effectiveComps }

  // Báo ngay lúc bấm (đồng bộ) — không đợi lưu server xong mới báo, vì lúc
  // đó màn hình đã chuyển sang học sinh khác rồi, dễ tưởng nhầm toast báo
  // sai tên. syncScore() vẫn lưu thật ở dưới nền, chỉ báo lỗi mới cần đợi.
  function announceSave(studentId: string) {
    const student = cls.students.find((s) => s.id === studentId)
    const target = student?.sessions.find((s) => s.no === noOf(studentId))
    if (!student || !target) return
    if (isMongoid(target.id)) {
      toast.success(`✓ Đã lưu điểm Buổi ${target.no} của ${student.name}`)
    } else {
      toast.info(`Đã tạo Buổi ${target.no} cho ${student.name} (${viDate(target.date)})`)
    }
  }

  async function syncScore(studentId: string) {
    if (!isMongoid(cls.id) || !isMongoid(studentId)) return
    const student = cls.students.find((s) => s.id === studentId)
    const targetNo = noOf(studentId)
    const target = student?.sessions.find((s) => s.no === targetNo)
    if (!student || !target) return // chưa nhập gì cho học sinh này buổi này — không có gì để lưu
    const maxes = target.maxes ?? {}
    const comps = r.comps.map((c) => (maxes[c.key] != null ? rescaleComp(c, maxes[c.key]) : c))
    const total = sessionScore(target.entry, { ...r, comps }) ?? 0
    setSyncStatus('saving')
    try {
      let sessionId = target.id
      if (!isMongoid(sessionId)) {
        const apiSession = await sessionService.create({
          classId: cls.id,
          studentId,
          title: `Buổi ${target.no}`,
          lessonNo: target.no,
          scheduledAt: `${target.date}T00:00:00.000Z`,
        })
        sessionId = apiSession._id
        update((c) => {
          const stu = c.students.find((s) => s.id === studentId)
          const ss = stu?.sessions.find((s) => s.no === targetNo)
          if (ss) ss.id = sessionId
        })
        logActivity('session.create', { className: cls.name, sessionNo: target.no, studentName: student.name }, 'ClassSession')
      }
      await scoreService.upsert({ classId: cls.id, sessionId, studentId, ...target.entry, total })
      setSyncStatus('saved')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('error')
      toast.error(`Lỗi lưu điểm Buổi ${target.no} của ${student.name}`, { persist: true })
    }
  }

  // Gom điểm đã nhập trước đây (còn kẹt trên máy này, chưa từng lên được
  // server do lỗi kiểu dữ liệu đã sửa) và đẩy lên server, 1 lần.
  async function backfillAllScores() {
    if (backfilling) return
    const jobs: Array<{ sessionId: string; studentId: string; entry: SessionEntry; total: number }> = []
    cls.students.forEach((stu) => {
      if (!isMongoid(stu.id)) return
      stu.sessions.forEach((s) => {
        if (!isMongoid(s.id)) return
        const maxes = s.maxes ?? {}
        const comps = r.comps.map((c) => (maxes[c.key] != null ? rescaleComp(c, maxes[c.key]) : c))
        const total = sessionScore(s.entry, { ...r, comps })
        if (total === null) return
        jobs.push({ sessionId: s.id, studentId: stu.id, entry: s.entry, total })
      })
    })
    if (!jobs.length) {
      toast.info('Không có điểm nào cần đồng bộ — mọi thứ đã lên server rồi.')
      return
    }
    if (!confirm(`Đồng bộ ${jobs.length} điểm đã nhập trước đây lên server?`)) return
    setBackfilling(true)
    setBackfillProgress({ done: 0, total: jobs.length })
    let okCount = 0
    let failCount = 0
    for (const job of jobs) {
      try {
        await scoreService.upsert({
          classId: cls.id, sessionId: job.sessionId, studentId: job.studentId,
          ...job.entry, total: job.total,
        })
        okCount++
      } catch {
        failCount++
      }
      setBackfillProgress((p) => ({ ...p, done: p.done + 1 }))
    }
    setBackfilling(false)
    if (failCount) {
      toast.error(`Đồng bộ xong: ${okCount} điểm thành công, ${failCount} lỗi (thử lại sau)`, { persist: true })
    } else {
      toast.success(`Đồng bộ xong: ${okCount} điểm thành công`)
    }
  }

  if (!cls.students.length)
    return (
      <Card className="p-6 text-center">
        <div className="text-sm" style={{ color: C.muted }}>
          Lớp chưa có học sinh nào. Vào tab <b>Lớp học</b> để thêm học sinh.
        </div>
      </Card>
    )

  const mut = (fn: (en: SessionEntry) => void) =>
    update((c) => {
      if (!st) return
      const ss = findOrCreateSession(c, st.id, selectedNo, effectiveDate, teacherName)
      FIELDS.forEach((k) => {
        if (!ss.entry[k]) (ss.entry as unknown as Record<string, unknown>)[k] = {}
      })
      fn(ss.entry)
    })

  function setHomework(v: string) {
    update((c) => {
      if (!st) return
      findOrCreateSession(c, st.id, selectedNo, effectiveDate, teacherName).homework = v
    })
  }

  function setSessionMax(key: string, val: number) {
    if (!val || val < 1) return
    // Chỉ sửa buổi của HỌC SINH ĐANG XEM — mỗi em có buổi riêng (số buổi và
    // ngày khác nhau), nên "Số câu" của Buổi 3 em này không liên quan gì tới
    // "Buổi 3" của em khác như trước đây khi cả lớp dùng chung 1 số buổi.
    update((c) => {
      if (!st) return
      const ss = findOrCreateSession(c, st.id, selectedNo, effectiveDate, teacherName)
      ss.maxes = ss.maxes ?? {}
      ss.maxes[key] = val
    })
  }

  function commitSessionMax(key: string, raw: string) {
    const val = Number(raw)
    if (raw.trim() && val >= 1) setSessionMax(key, val)
    // Luôn xóa draft sau khi rời ô — input quay về đọc giá trị thật (đã lưu, hoặc mặc định nếu gõ rỗng/không hợp lệ)
    setMaxDrafts((d) => {
      const next = { ...d }
      delete next[key]
      return next
    })
  }

  // Tổng câu của tiêu chí (VD "Bài tập về nhà") dùng luôn làm mẫu số mặc định
  // cho ô "Kết quả: đúng X/Y câu" — sửa 1 trong 2 chỗ đều ra cùng 1 số.
  const ratioTotals: Record<string, number> = {}
  r2.comps.forEach((comp) => {
    comp.evidence?.forEach((ev) => {
      if (ev.type === 'ratio' && sessionMaxes[comp.key] != null) {
        ratioTotals[comp.key + '__' + ev.key] = sessionMaxes[comp.key]
      }
    })
  })

  function presetClass() {
    if (!confirm('Đặt điểm mặc định (đạt tối đa) cho CẢ LỚP, ở buổi đang xem của từng em? Điểm đã nhập trước đó của buổi đó sẽ bị ghi đè.')) return
    update((c) => {
      c.students.forEach((s) => {
        const ss = findOrCreateSession(c, s.id, noOf(s.id), effectiveDate, teacherName)
        FIELDS.forEach((k) => {
          if (!ss.entry[k]) (ss.entry as unknown as Record<string, unknown>)[k] = {}
        })
        const en = ss.entry
        en.attendance = 'present'
        r2.comps.forEach((comp) => {
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
    toast.success('Đã đặt mặc định cho cả lớp — ở buổi đang xem của từng em')
  }

  // ── Group selection logic ──────────────────────────────────────────────────
  function toggleGroupMode() {
    setGroupMode((g) => !g)
    setGroupSelected(new Set())
  }

  function toggleStudentSelection(sid: string) {
    setGroupSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  function selectAll() {
    setGroupSelected(new Set(cls.students.map((s) => s.id)))
  }

  function clearSelection() {
    setGroupSelected(new Set())
  }

  function applyGroupScores() {
    if (!st || groupSelected.size === 0) return
    const srcEntry = e
    const count = groupSelected.size
    update((c) => {
      groupSelected.forEach((sid) => {
        findOrCreateSession(c, sid, noOf(sid), effectiveDate, teacherName).entry = cloneEntry(srcEntry)
      })
    })
    setGroupSelected(new Set())
    setGroupMode(false)
    toast.success(`Đã áp dụng điểm của "${st.name}" cho ${count} học sinh`)
  }
  // ──────────────────────────────────────────────────────────────────────────

  const total = sessionScore(e, r2)
  // So với các bạn cùng buổi này — nếu có bạn khác đã chấm 1 mục mà học sinh
  // đang xem chưa có, khả năng cao là quên chấm (không phải hôm đó không có
  // mục ấy, vì nếu vậy CẢ LỚP sẽ cùng thiếu, không riêng 1 người).
  const missingFlags = st ? detectMissingComps(cls, selectedNo, st.id, r2.comps) : []
  const done = cls.students.filter((s) => {
    const ss = s.sessions.find((x) => x.no === noOf(s.id))
    return ss ? sessionScore(ss.entry, r2) !== null : false
  }).length

  const studentSessionCount = st?.sessions.length ?? 0
  const showReminder = studentSessionCount > 0 && studentSessionCount % cls.perMonth === 0

  // Xem nhanh kết quả cả lớp ở buổi đang xem của TỪNG em (mỗi em có số buổi
  // và ngày riêng) — không cần xuất Excel
  const daySummary = cls.students.map((s) => {
    const no = noOf(s.id)
    const ss = s.sessions.find((x) => x.no === no)
    const t = ss ? sessionScore(ss.entry, r2) : null
    return { student: s, no, session: ss, total: t }
  })

  return (
    <div className="space-y-3">
      <Card className="p-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {editingWhen ? (
            <>
              <select
                value={selectedNo}
                onChange={(x) => {
                  const newNo = Number(x.target.value)
                  // Lưu điểm buổi ĐANG chọn lên server trước khi chuyển sang
                  // buổi khác — trước đây đổi buổi ở đây không lưu, chỉ có
                  // chuyển HỌC SINH (Trước/Tiếp theo/chọn tên) mới lưu, nên
                  // điểm buổi cũ bị kẹt lại máy này, không lên được server.
                  if (st) { announceSave(st.id); void syncScore(st.id) }
                  setSelectedNo(newNo)
                  setDraftDate(todayISO())
                }}
                title="Chọn số buổi — mỗi học sinh có buổi riêng, có thể khác ngày nhau"
                className="rounded-md px-3 py-2 text-sm font-semibold"
                style={{ background: C.paper, color: C.board, border: `1px solid ${C.line}` }}
              >
                {Array.from({ length: maxNo }, (_, i) => i + 1).map((no) => {
                  const existing = st?.sessions.find((s) => s.no === no)
                  return (
                    <option key={no} value={no}>
                      Buổi {no} — {existing ? viDate(existing.date) : 'chưa có'}
                    </option>
                  )
                })}
              </select>
              <input
                type="date"
                value={effectiveDate}
                onChange={(x) => handleDateChange(x.target.value)}
                title="Ngày của buổi đang chọn"
                className="rounded-md px-3 py-2 text-sm font-semibold"
                style={{ border: `1px solid ${C.line}` }}
              />
              {session && (
                renamingNo ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: C.muted }}>Đổi thành Buổi</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={renameDraft}
                      onChange={(x) => setRenameDraft(x.target.value.replace(/\D/g, ''))}
                      onKeyDown={(x) => {
                        if (x.key === 'Enter') commitRenameSessionNo()
                        if (x.key === 'Escape') { setRenamingNo(false); setRenameDraft('') }
                      }}
                      className="w-14 rounded-md px-2 py-1.5 text-center text-sm font-bold"
                      style={{ border: `1px solid ${C.line}` }}
                    />
                    <button
                      onClick={commitRenameSessionNo}
                      className="rounded-md px-2.5 py-1.5 text-xs font-bold"
                      style={{ background: C.emerald, color: '#fff' }}
                    >
                      Lưu
                    </button>
                    <button
                      onClick={() => { setRenamingNo(false); setRenameDraft('') }}
                      className="rounded-md px-2 py-1.5 text-xs"
                      style={{ color: C.muted }}
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setRenamingNo(true); setRenameDraft(String(selectedNo)) }}
                    title="Đổi số Buổi này — giữ nguyên điểm/bài tập/điểm danh đã chấm, chỉ đổi nhãn số"
                    className="rounded-md px-2.5 py-2 text-xs font-bold"
                    style={{ color: C.board2, border: `1px dashed ${C.board2}66` }}
                  >
                    <span className="inline-flex items-center gap-1"><Icon name="entry" size={14} /> Đổi số buổi</span>
                  </button>
                )
              )}
              <button
                onClick={() => setEditingWhen(false)}
                className="min-h-11 rounded-md px-3 text-sm font-bold"
                style={{ background: C.emerald, color: '#fff' }}
              >
                ✓ Xong
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditingWhen(true)}
              title="Bấm để đổi Buổi/Ngày — đang khóa để tránh chạm nhầm"
              className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold"
              style={{ background: C.paper, color: C.board, border: `1px solid ${C.line}` }}
            >
              <span className="inline-flex items-center gap-1.5"><Icon name="lock" size={16} /> Buổi {selectedNo} — {viDate(effectiveDate)}</span>
              <span className="inline-flex items-center gap-1" style={{ color: C.board2 }}><Icon name="entry" size={16} /> Sửa</span>
            </button>
          )}
          {!session && (
            <span className="text-xs" style={{ color: C.muted }}>(chưa lưu)</span>
          )}
          <Btn onClick={presetClass} title="Đặt sẵn mức đạt cho cả lớp">
            <span className="inline-flex items-center gap-1.5"><Icon name="bolt" size={16} /> Mặc định</span>
          </Btn>
          <button
            onClick={toggleGroupMode}
            title="Chọn nhóm học sinh có cùng điểm để áp dụng nhanh"
            className="min-h-11 rounded-md px-3 text-sm font-semibold"
            style={{
              background: groupMode ? C.emerald : C.paper,
              color: groupMode ? '#fff' : C.muted,
              border: `1.5px solid ${groupMode ? C.emerald : C.line}`,
            }}
          >
            <span className="inline-flex items-center gap-1.5"><Icon name="checksq" size={16} /> Chọn nhóm</span>
          </button>
          <button
            onClick={() => setShowSummary((v) => !v)}
            title="Xem điểm cả lớp trong ngày đang chọn, không cần xuất Excel"
            className="min-h-11 rounded-md px-3 text-sm font-semibold"
            style={{
              background: showSummary ? C.board : C.paper,
              color: showSummary ? '#fff' : C.muted,
              border: `1px solid ${showSummary ? C.board : C.line}`,
            }}
          >
            <span className="inline-flex items-center gap-1.5"><Icon name="list" size={16} /> Xem cả lớp</span>
          </button>
          <button
            onClick={backfillAllScores}
            disabled={backfilling}
            title="Đẩy điểm đã nhập trước đây (còn kẹt trên máy này) lên server"
            className="min-h-11 rounded-md px-3 text-sm font-semibold"
            style={{ background: C.paper, color: C.muted, border: `1px solid ${C.line}` }}
          >
            <span className="inline-flex items-center gap-1.5"><Icon name="cloud" size={16} />{backfilling ? `Đang đồng bộ ${backfillProgress.done}/${backfillProgress.total}...` : 'Đồng bộ điểm cũ'}</span>
          </button>
          <div className="ml-auto flex items-center gap-3 text-sm" style={{ color: C.muted }}>
            {syncStatus === 'saving' && <span style={{ color: C.board2 }}>⟳ Đang lưu...</span>}
            {syncStatus === 'saved' && (
              <span className="animate-slide-down inline-flex items-center gap-1" style={{ color: C.emerald }}><Icon name="check" size={16} /> Đã lưu</span>
            )}
            {syncStatus === 'error' && <span className="inline-flex items-center gap-1" style={{ color: C.red }}><Icon name="alert" size={16} /> Lỗi lưu</span>}
            <span>Đã nhập <b style={{ color: C.ink }}>{done}</b>/{cls.students.length}</span>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={(done / Math.max(1, cls.students.length)) * 100} color={C.emerald} height={6} animated className="flex-1" />
          <span className="shrink-0 text-xs font-bold tabular-nums" style={{ color: C.emerald }}>
            {done}/{cls.students.length} · {Math.round((done / Math.max(1, cls.students.length)) * 100)}%
          </span>
        </div>

        {/* Xem nhanh cả lớp cho đúng buổi số này — mỗi em có thể khác ngày */}
        {showSummary && (
          <div className="mt-2 overflow-hidden rounded-md" style={{ border: `1px solid ${C.line}` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.paper }}>
                  <th className="py-1.5 px-3 text-left font-semibold" style={{ color: C.muted }}>Học sinh</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Buổi</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Ngày</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Điểm danh</th>
                  <th className="py-1.5 px-3 text-center font-semibold" style={{ color: C.muted }}>Tổng điểm</th>
                </tr>
              </thead>
              <tbody>
                {daySummary.map(({ student, no, session: ss, total: t }, i) => (
                  <tr
                    key={student.id}
                    onClick={() => {
                      if (i === cur) return
                      // Cùng luồng lưu-rồi-mới-chuyển như bấm chọn học sinh ở
                      // dải pill bên dưới — trước đây bấm dòng này đổi thẳng
                      // học sinh đang xem, bỏ qua lưu điểm của người đang xem.
                      requestNav(() => {
                        if (st) { announceSave(st.id); void syncScore(st.id) }
                        setCur(i)
                      })
                    }}
                    className="cursor-pointer"
                    style={{ borderTop: `1px solid ${C.line}`, background: i === cur ? C.board + '0D' : undefined }}
                  >
                    <td className="py-1.5 px-3 font-semibold">{student.name}</td>
                    <td className="py-1.5 px-3 text-center font-semibold" style={{ color: C.board }}>B{no}</td>
                    <td className="py-1.5 px-3 text-center" style={{ color: C.muted }}>
                      {ss ? viDate(ss.date) : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-center" style={{ color: C.muted }}>
                      {ss ? (ATTEND.find((a) => a.key === ss.entry.attendance)?.label ?? '—') : '—'}
                    </td>
                    <td className="py-1.5 px-3 text-center font-bold" style={{ color: t !== null ? scoreColor(t) : C.muted }}>
                      {t !== null ? t : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Session-level question count settings */}
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-xs" style={{ background: C.paper }}>
          <span className="font-bold shrink-0" style={{ color: C.muted }}>Số câu:</span>
          {r2.comps.filter((c) => c.type === 'score').map((comp) => (
            <label key={comp.key} className="flex items-center gap-1">
              <span style={{ color: C.muted }}>{comp.label}</span>
              <input
                type="text"
                inputMode="numeric"
                value={maxDrafts[comp.key] ?? String(sessionMaxes[comp.key] ?? comp.max)}
                onFocus={(x) => x.target.select()}
                onChange={(x) => setMaxDrafts((d) => ({ ...d, [comp.key]: x.target.value.replace(/\D/g, '') }))}
                onBlur={(x) => commitSessionMax(comp.key, x.target.value)}
                onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur() }}
                className="w-14 rounded-md px-1 py-0.5 text-center font-bold"
                style={{ border: `1px solid ${C.board}66` }}
              />
              <span style={{ color: C.muted }}>câu</span>
            </label>
          ))}
          {r2.comps.flatMap((comp) =>
            (comp.evidence ?? [])
              .filter((ev) => ev.type === 'ratio')
              .map((ev) => {
                const k = comp.key
                return (
                  <label key={comp.key + '_' + ev.key} className="flex items-center gap-1">
                    <span style={{ color: C.muted }}>{comp.label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={maxDrafts[k] ?? String(sessionMaxes[k] ?? comp.max)}
                      onFocus={(x) => x.target.select()}
                      onChange={(x) => setMaxDrafts((d) => ({ ...d, [k]: x.target.value.replace(/\D/g, '') }))}
                      onBlur={(x) => commitSessionMax(k, x.target.value)}
                      onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur() }}
                      className="w-14 rounded-md px-1 py-0.5 text-center font-bold"
                      style={{ border: `1px solid ${C.board}66` }}
                    />
                    <span style={{ color: C.muted }}>câu</span>
                  </label>
                )
              }),
          )}
        </div>

        {/* Group mode guide banner */}
        {groupMode && (
          <div
            className="mt-2 rounded-md px-3 py-2 text-xs"
            style={{ background: C.emerald + '14', border: `1.5px solid ${C.emerald}55`, color: C.ink }}
          >
            <b>Chế độ chọn nhóm:</b> Bấm vào từng học sinh để chọn → xem điểm của bạn muốn sao chép bên dưới → bấm <b>Áp dụng</b>.
            Dùng nút ← → để chuyển học sinh đang xem.
          </div>
        )}

        {/* Student pills */}
        <div className="mt-2 flex flex-wrap gap-2">
          {cls.students.map((s, i) => {
            const ss = s.sessions.find((x) => x.no === noOf(s.id))
            const t = ss ? sessionScore(ss.entry, r2) : null
            const active = i === cur
            const inGroup = groupSelected.has(s.id)
            const missing = t === null && ss?.entry.attendance !== 'excused'

            return (
              <button
                key={s.id}
                onClick={() => {
                  if (groupMode) {
                    toggleStudentSelection(s.id)
                  } else if (i === cur) {
                    // đang xem sẵn rồi — không cần xác nhận gì
                  } else {
                    requestNav(() => {
                      if (st) { announceSave(st.id); void syncScore(st.id) }
                      setCur(i)
                    })
                  }
                }}
                className="relative inline-flex min-h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-semibold transition-all"
                style={{
                  background: active ? C.board2 : inGroup ? C.emerald + '1F' : C.card,
                  color: active ? '#fff' : inGroup ? C.emerald : t !== null ? C.ink : C.muted,
                  border: `1.5px solid ${active ? C.board2 : inGroup ? C.emerald : C.line}`,
                  outline: active && groupMode ? `2px solid ${C.emerald}` : undefined,
                }}
              >
                {groupMode && <Icon name={inGroup ? 'checksq' : 'list'} size={14} />}
                {/* Đã chấm = dấu tích cỏ; đang xem = góc thẻ gấp (dấu chỗ đang dừng) */}
                {!active && t !== null && !groupMode && <span style={{ color: C.emerald }}><Icon name="check" size={14} /></span>}
                {s.name}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0 top-0 h-3 w-3"
                    style={{ background: C.gold, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
                  />
                )}
                {!active && missing && (
                  <span
                    className="absolute -top-1 -right-1 h-2 w-2 rounded-full"
                    style={{ background: C.gold }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Group selection action bar */}
        {groupMode && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={selectAll}
              className="min-h-11 rounded-md px-3 text-sm font-semibold"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.muted }}
            >
              Chọn tất cả
            </button>
            <button
              onClick={clearSelection}
              className="min-h-11 rounded-md px-3 text-sm font-semibold"
              style={{ background: C.paper, border: `1px solid ${C.line}`, color: C.muted }}
            >
              Bỏ chọn
            </button>
            <span className="text-xs" style={{ color: C.muted }}>
              Đã chọn: <b style={{ color: C.emerald }}>{groupSelected.size}</b> học sinh
            </span>
            {groupSelected.size > 0 && st && (
              <button
                onClick={applyGroupScores}
                className="min-h-11 rounded-md px-4 text-sm font-bold"
                style={{ background: C.emerald, color: '#fff', marginLeft: 'auto' }}
              >
                Áp dụng điểm của "{st.name}" → {groupSelected.size} học sinh đã chọn
              </button>
            )}
          </div>
        )}

      </Card>

      {st && (
        <Card accentTop={groupMode ? C.emerald : e.attendance === 'absent' ? C.rose : C.board2}>
          {/* Mặt thẻ: tên học sinh là chữ to nhất trang, tổng điểm đối diện. */}
          <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-3">
            <div className="min-w-0">
              <div className="text-xs" style={{ color: C.muted }}>
                {groupMode
                  ? 'Chế độ nhóm · Điểm mẫu để áp dụng'
                  : `Phiếu ${r.label} · thẻ ${cur + 1}/${cls.students.length}`}
              </div>
              <div className="font-display text-3xl font-extrabold leading-tight" style={{ color: C.ink }}>{st.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {e.attendance === 'absent' && (
                  <span className="rounded-sm px-2 py-0.5 text-xs font-bold" style={{ background: C.rose + '22', color: C.ink }}>
                    Vắng buổi này
                  </span>
                )}
                {total !== null && (
                  <span
                    className="font-display inline-block rounded-sm px-2 text-sm font-bold"
                    style={{ border: `2px solid ${C.board2}`, color: C.board2, transform: 'rotate(-4deg)' }}
                  >
                    ĐÃ CHẤM
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs" style={{ color: C.muted }}>Tổng buổi này</div>
              <div
                className="font-display text-5xl font-extrabold leading-none"
                style={{ fontVariantNumeric: 'tabular-nums', color: total === null ? C.line : scoreColor(total) }}
              >
                {total === null ? '—' : total}
                {total !== null && <span className="text-base font-bold" style={{ color: C.muted }}>/100</span>}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {showReminder && (
              <div
                className="rounded-md px-4 py-2.5 text-sm font-semibold"
                style={{ background: C.gold + '26', color: C.ink, border: `1.5px solid ${C.gold}` }}
              >
                <Icon name="calendar" size={16} className="mr-1.5 inline align-[-3px]" />{st.name} đã đủ <b>{studentSessionCount}</b> buổi học! Nhớ vào <b>Báo cáo</b> để gửi nhận xét cho phụ huynh.
              </div>
            )}

            {missingFlags.length > 0 && (
              <div
                className="rounded-md px-4 py-2.5 text-sm"
                style={{ background: C.rose + '12', color: C.ink, border: `1.5px solid ${C.rose}66` }}
              >
                <div className="font-semibold">
                  <Icon name="alert" size={16} className="mr-1.5 inline align-[-3px]" />Có thể quên chấm cho {st.name} — Buổi {selectedNo}:
                </div>
                <ul className="mt-1 ml-4 list-disc space-y-0.5">
                  {missingFlags.map((f) => (
                    <li key={f.compKey}>
                      <b>{f.compLabel}</b>: {f.peersWithData}/{f.totalPeers} bạn khác cùng buổi này đã chấm mục này rồi.
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-xs opacity-80">
                  Không phải hôm nay không có mục này (nếu vậy cả lớp sẽ cùng thiếu) — kiểm tra lại nhé.
                </div>
              </div>
            )}

            <div className="rounded-md p-3" style={{ background: C.card, border: `1.5px solid ${C.line}`, borderTop: `6px solid ${tabColor(0)}` }}>
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
                    onClick={() => mut((en) => { en.attendance = a.key })}
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
              <div className="rounded-md p-3 text-sm" style={{ background: C.paper, color: C.muted }}>
                Buổi nghỉ phép — không tính vào điểm trung bình, chỉ trừ điểm chuyên cần.
              </div>
            ) : (
              r2.comps.map((comp, ci) => (
                <div
                  key={comp.key}
                  className="rounded-md p-3"
                  style={{ background: C.card, border: `1.5px solid ${C.line}`, borderTop: `6px solid ${tabColor(ci + 1)}` }}
                >
                  <CompEditor
                    comp={comp}
                    e={e}
                    mut={mut}
                    ratioTotals={ratioTotals}
                    maxDraft={maxDrafts[comp.key]}
                    onMaxInput={(raw) => setMaxDrafts((d) => ({ ...d, [comp.key]: raw }))}
                    onMaxCommit={(raw) => commitSessionMax(comp.key, raw)}
                  />
                </div>
              ))
            )}

            {/* Study hours */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted }}>
                  Giờ ở lại học thêm
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="5" step="0.5"
                    value={e.stayHours ?? ''}
                    onFocus={(x) => x.target.select()}
                    onChange={(x) =>
                      mut((en) => { en.stayHours = x.target.value === '' ? undefined : Number(x.target.value) })
                    }
                    className="w-20 rounded-md px-3 py-2 text-center font-bold"
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
                    type="number" min="0" max="10" step="0.5"
                    value={e.homeHours ?? ''}
                    onFocus={(x) => x.target.select()}
                    onChange={(x) =>
                      mut((en) => { en.homeHours = x.target.value === '' ? undefined : Number(x.target.value) })
                    }
                    className="w-20 rounded-md px-3 py-2 text-center font-bold"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                  <span className="text-xs" style={{ color: C.muted }}>giờ</span>
                </div>
              </label>
            </div>

            <input
              value={session?.homework ?? ''}
              onChange={(x) => setHomework(x.target.value)}
              placeholder="Bài tập về nhà riêng cho học sinh này (bỏ trống nếu không có)"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            <input
              value={e.note}
              onChange={(x) => mut((en) => { en.note = x.target.value })}
              placeholder="Ghi chú riêng cho học sinh này (không bắt buộc)"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            <div className="flex gap-2">
              <Btn
                onClick={() => requestNav(() => {
                  announceSave(st.id)
                  void syncScore(st.id)
                  logActivity('score.entry', { className: cls.name, sessionNo: session?.no ?? 0, studentName: st.name }, 'Score')
                  setCur(Math.max(0, cur - 1))
                })}
              >
                <span className="inline-flex items-center gap-1.5"><Icon name="arrowL" size={16} /> Trước</span>
              </Btn>
              {groupMode && groupSelected.size > 0 ? (
                <button
                  onClick={applyGroupScores}
                  className="flex-1 rounded-md py-2 text-sm font-bold"
                  style={{ background: C.emerald, color: '#fff' }}
                >
                  <span className="inline-flex items-center justify-center gap-1.5"><Icon name="check" size={16} /> Áp dụng cho {groupSelected.size} học sinh đã chọn</span>
                </button>
              ) : (
                <Btn
                  kind="solid"
                  size="lg"
                  className="flex-1"
                  onClick={() => requestNav(() => {
                    announceSave(st.id)
                    void syncScore(st.id)
                    logActivity('score.entry', { className: cls.name, sessionNo: session?.no ?? 0, studentName: st.name }, 'Score')
                    setCur(Math.min(cls.students.length - 1, cur + 1))
                  })}
                >
                  <span className="inline-flex items-center justify-center gap-2">Học sinh tiếp theo <Icon name="arrowR" size={18} /></span>
                </Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Mép các thẻ còn lại trong bộ: nhìn là biết lớp còn bao nhiêu em chưa tới lượt. */}
      {st && cls.students.length - cur - 1 > 0 && (
        <div aria-hidden="true" className="-mt-3">
          {Array.from({ length: Math.min(3, cls.students.length - cur - 1) }, (_, i) => (
            <div
              key={i}
              className="h-1.5"
              style={{
                marginInline: 8 * (i + 1),
                background: C.card,
                border: `1.5px solid ${C.line}`,
                borderTop: 'none',
              }}
            />
          ))}
        </div>
      )}
      {st && cls.students.length - cur - 1 > 0 && (
        <div className="text-center text-xs" style={{ color: C.muted }}>
          Còn {cls.students.length - cur - 1} thẻ nữa trong bộ
        </div>
      )}

      {/* Xác nhận trước khi lưu & chuyển sang học sinh khác — xem lại 1 lần
       *  cuối Buổi/Ngày/Điểm danh/Tổng điểm để tránh bấm nhầm rồi "nhảy" đi
       *  mất mà không để ý. */}
      {pendingNav && st && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: '#00000066' }}
          onClick={cancelNav}
        >
          <Card className="w-full max-w-sm p-5" onClick={(x) => x.stopPropagation()}>
            <div className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: C.muted }}>
              Xác nhận trước khi lưu
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Học sinh</span>
                <b style={{ color: C.ink }}>{st.name}</b>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Buổi</span>
                <b style={{ color: C.ink }}>{selectedNo}</b>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Ngày</span>
                <b style={{ color: C.ink }}>{viDate(effectiveDate)}</b>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Điểm danh</span>
                <b style={{ color: C.ink }}>{ATTEND.find((a) => a.key === e.attendance)?.label ?? '—'}</b>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.muted }}>Tổng điểm</span>
                <b style={{ color: total !== null ? scoreColor(total) : C.ink }}>{total === null ? '—' : total}</b>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Btn className="flex-1" onClick={cancelNav}>← Sửa lại</Btn>
              <Btn kind="gold" className="flex-1" onClick={confirmNav}>✓ Xác nhận</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
