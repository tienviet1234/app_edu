import { isMongoid } from '@/utils/mongoid'
import type { OrphanRecord, Session, SessionConflict, SessionEntry } from '@/types'
import { emptyEntry } from '@/business/seed'
import { sameEntry } from '@/business/strandedScores'

/**
 * App lưu 1 bản sao dữ liệu lớp/học sinh/buổi vào local storage từng máy để
 * mở nhanh (xem `store/appStore.ts`), và chỉ THÊM dữ liệu mới từ server vào
 * — không bao giờ tự gỡ bản ghi cục bộ dù server không còn liệt kê nữa (VD:
 * học sinh bị gộp tài khoản/chuyển lớp qua `mergeStudentIntoClass`, buổi học
 * bị chuyển sang lớp khác). Hậu quả: máy nào đã mở lớp đó trước khi đổi sẽ
 * mãi mãi hiển thị bản ghi cũ trùng lặp — dù F5 bao nhiêu lần, dù đăng nhập
 * bằng tài khoản khác (giáo viên/admin) trên máy khác thì máy đó nếu CHƯA
 * từng mở lớp sẽ đúng ngay, nhưng máy ĐÃ từng mở (cache cũ) thì không tự sửa.
 *
 * Hàm này gỡ đúng các bản ghi "đã đồng bộ nhưng server không còn liệt kê" —
 * dùng chung cho cả danh sách học sinh của 1 lớp VÀ danh sách buổi của 1 học
 * sinh. Học sinh/buổi CHƯA đồng bộ (id tạm, chưa phải Mongo ObjectId) không
 * bao giờ bị đụng tới — đó là dữ liệu mới thêm trên máy, chưa kịp lên server,
 * gỡ nhầm sẽ mất trắng.
 */
export function pruneGoneFromServer<T extends { id: string }>(
  local: T[],
  serverIds: Set<string>,
): T[] {
  return local.filter((item) => !isMongoid(item.id) || serverIds.has(item.id))
}

/**
 * Thẩm định số buổi "đang xem" đã lưu sẵn trên máy (`noByStudent` ở
 * EntryScreen, lưu RAW SỐ chứ không phải id buổi) còn hợp lý để dùng tiếp
 * không — trả về `null` nếu là số RÁC (phải quay về mặc định).
 *
 * 2 trường hợp được coi là HỢP LỆ:
 *   1. Khớp đúng 1 buổi đã có sẵn của học sinh đó.
 *   2. Là buổi KẾ TIẾP CHƯA TẠO (VD vừa bấm "Chọn tháng" sang kỳ sau) — buổi
 *      này chưa có bản ghi nào cho tới khi giáo viên thật sự nhập điểm, nên
 *      không được coi là "số rác" chỉ vì chưa khớp buổi có sẵn. Cho phép tới
 *      mốc xa nhất CẢ LỚP đã chạm (classWideMaxNo) hoặc buổi kế tiếp của
 *      chính em đó, tùy cái nào xa hơn.
 *
 * Ngoài 2 trường hợp trên (VD số cũ đã bị xóa/xếp lại, như "1014" từng gặp ở
 * Lớp 7) thì coi là rác, trả về `null`.
 *
 * Bug thật đã gặp khi thiếu vế (2): chọn "Tháng 2" (buổi kế tiếp CHƯA tạo)
 * xong vừa nhập điểm là bị validate rớt (không khớp buổi có sẵn nào), tự
 * nhảy ngược về buổi mặc định (Tháng 1) — tưởng "không có chỗ nhập Tháng 2".
 */
export function resolvePlausibleNo(
  stored: number | undefined | null,
  existingNos: number[],
  classWideMaxNo: number,
): number | null {
  if (stored == null) return null
  if (existingNos.includes(stored)) return stored
  const myMaxNo = existingNos.length ? Math.max(...existingNos) : 0
  const plausibleBound = Math.max(classWideMaxNo, myMaxNo + 1)
  return stored >= 1 && stored <= plausibleBound ? stored : null
}

/** 1 buổi (theo học sinh) như server trả về — đủ field để đồng bộ xuống máy. */
export interface ServerSessionForSync {
  _id: string
  studentId?: string
  scheduledAt: string
  lessonNo?: number
  notes?: string
  billed?: boolean
  maxes?: Record<string, number>
  createdByName?: string
  createdAt?: string
}

/** Điểm của 1 buổi trên server (cùng hình dạng SessionEntry). */
export type ServerScoreForSync = Omit<SessionEntry, 'ev'> & { sessionId: string; ev: unknown; updatedAt?: string }

const sameMaxes = (a?: Record<string, number>, b?: Record<string, number>) =>
  JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort())

export const toSessionEntry = (sc: ServerScoreForSync): SessionEntry => ({
  attendance: sc.attendance,
  scores: sc.scores ?? {},
  tags: sc.tags ?? {},
  ticks: sc.ticks ?? {},
  choice: sc.choice ?? {},
  parts: sc.parts ?? {},
  skip: sc.skip ?? {},
  ev: (sc.ev ?? {}) as SessionEntry['ev'],
  note: sc.note ?? '',
})

const isBlankEntry = (e: SessionEntry | undefined) => JSON.stringify(e ?? emptyEntry()) === JSON.stringify(emptyEntry())

/** Trải phẳng nội dung 1 buổi thành "đường dẫn → giá trị" (bỏ ô trống, "8" = 8,
 *  thứ tự tick không quan trọng, "có mặt" là mặc định) — để so từng ô. */
function flattenEntry(e: SessionEntry): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k)
    } else if (Array.isArray(v)) {
      if (v.length) out[path] = JSON.stringify([...v].map(String).sort())
    } else if (v !== undefined && v !== null && v !== '' && v !== false) {
      const s = typeof v === 'string' ? v.trim() : v
      if (s !== '') out[path] = typeof s === 'string' && !Number.isNaN(Number(s)) ? String(Number(s)) : JSON.stringify(s)
    }
  }
  for (const f of ['attendance', 'scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev', 'note'] as const) walk(e[f], f)
  if (out.attendance === '"present"') delete out.attendance
  return out
}

/** Bản server CHỨA TRỌN bản máy (mọi ô máy có, server có đúng giá trị đó; ghi
 *  chú server được phép dài thêm ở cuối) → máy lấy bản server không mất gì. */
export function entryContains(server: SessionEntry, local: SessionEntry): boolean {
  const s = flattenEntry(server)
  for (const [k, v] of Object.entries(flattenEntry(local))) {
    if (s[k] === v) continue
    if (k === 'note' && s[k] && (JSON.parse(s[k]) as string).startsWith(JSON.parse(v) as string)) continue
    return false
  }
  return true
}

/**
 * Đồng bộ server → máy cho các học sinh của 1 lớp (sửa TRỰC TIẾP mảng được
 * truyền vào — gọi trong immer `produce`). Trả về true nếu có thay đổi.
 *
 * Quy tắc (mỗi quy tắc đều từng là 1 sự cố thật — xem test):
 *  - Số buổi / ngày / đã thu tiền (`no`/`date`/`billed`): server quyết định,
 *    luôn lấy theo server (admin xếp lại số, sửa ngày, đánh dấu đã thu).
 *  - Nội dung (điểm, nhận xét, bài tập về nhà, số câu):
 *      · máy đang `dirty` (sửa chưa được server xác nhận) → GIỮ bản máy, không
 *        bao giờ để server ghi đè ngược (trước đây bài tập về nhà đang gõ bị
 *        server ghi đè lại nếu danh sách tải lại đúng lúc).
 *      · máy đã `synced` mà không dirty → bản máy chỉ là bản sao → LẤY THEO
 *        SERVER (trước đây không bao giờ làm mới → máy A sửa điểm, máy B mãi
 *        hiện điểm cũ — "1 tài khoản 2 máy 2 dữ liệu").
 *      · dữ liệu cũ (chưa có cờ synced): chỉ điền khi máy còn trống, khớp
 *        nhau thì đánh dấu synced; KHÁC nhau thì giữ nguyên (không biết bản
 *        nào đúng — công cụ "Dữ liệu kẹt" của admin sẽ báo).
 *  - Buổi server có mà máy chưa có → thêm (đánh dấu synced).
 *  - Buổi đã đồng bộ mà server không còn → gỡ, TRỪ khi máy đang dirty (sửa
 *    chưa lên — gỡ là mất; danh sách server có thể chỉ là bản cache cũ chưa
 *    có buổi vừa tạo).
 *  - Buổi id tạm (chưa lên server) không bao giờ bị đụng tới.
 */
export function syncStudentsFromServer(
  students: Array<{ id: string; sessions: Session[] }>,
  serverSessions: ServerSessionForSync[],
  scoresBySession: Map<string, ServerScoreForSync>,
): boolean {
  let changed = false
  const perStudent = serverSessions.filter((s) => s.studentId)
  const serverIds = new Set(perStudent.map((s) => s._id))
  const localById = new Map<string, Session>()
  for (const st of students) for (const s of st.sessions) localById.set(s.id, s)

  for (const as of perStudent) {
    const local = localById.get(as._id)
    const score = scoresBySession.get(as._id)
    const date = as.scheduledAt.slice(0, 10)
    if (!local) {
      const student = students.find((st) => st.id === as.studentId)
      if (!student) continue
      student.sessions.push({
        id: as._id,
        no: as.lessonNo ?? student.sessions.length + 1,
        date,
        homework: as.notes ?? '',
        createdByName: as.createdByName,
        recordedAt: as.createdAt,
        billed: as.billed,
        maxes: as.maxes,
        entry: score ? toSessionEntry(score) : emptyEntry(),
        synced: true,
        baseUpdatedAt: score?.updatedAt,
      })
      changed = true
      continue
    }
    // Phần server quyết định.
    const no = as.lessonNo ?? local.no
    if (local.no !== no) { local.no = no; changed = true }
    if (local.date !== date) { local.date = date; changed = true }
    if (!!local.billed !== !!as.billed) { local.billed = as.billed; changed = true }

    // Sửa chưa lên server — không ghi đè ngược, và GIỮ NGUYÊN baseUpdatedAt
    // (mốc bản server mà phần sửa dựa vào) để server phát hiện được nếu máy
    // khác lưu chen vào giữa.
    if (local.dirty) continue
    const serverEntry = score ? toSessionEntry(score) : null
    const serverHomework = as.notes ?? ''
    const setBase = () => {
      if (score?.updatedAt && local.baseUpdatedAt !== score.updatedAt) { local.baseUpdatedAt = score.updatedAt; changed = true }
    }
    if (local.synced) {
      if (local.serverCopy) { local.serverCopy = undefined; changed = true }
      if (serverEntry && !sameEntry(local.entry, serverEntry)) { local.entry = serverEntry; changed = true }
      if ((local.homework ?? '') !== serverHomework) { local.homework = serverHomework; changed = true }
      if (as.maxes && !sameMaxes(local.maxes, as.maxes)) { local.maxes = as.maxes; changed = true }
      setBase()
      continue
    }
    // Dữ liệu cũ, chưa biết đã khớp server chưa. Máy trống, hoặc server CHỨA
    // TRỌN bản máy (VD máy giữ bản bị đè thiếu ô, server đã được khôi phục đủ)
    // → lấy bản server, không mất gì; khác kiểu khác thì vẫn giữ bản máy.
    if (serverEntry && (isBlankEntry(local.entry) || (!sameEntry(local.entry, serverEntry) && entryContains(serverEntry, local.entry)))) {
      local.entry = serverEntry
      changed = true
    }
    // Bài tập về nhà: giữ hành vi cũ — server thắng (luôn được gửi kèm mỗi
    // lần lưu điểm nên server là bản chuẩn); máy đang sửa dở đã được chặn ở
    // nhánh dirty phía trên.
    if ((local.homework ?? '') !== serverHomework) { local.homework = serverHomework; changed = true }
    if (as.maxes && !local.maxes) { local.maxes = as.maxes; changed = true }
    const contentMatches = (serverEntry ? sameEntry(local.entry, serverEntry) : isBlankEntry(local.entry))
      && (local.homework ?? '') === serverHomework
      && (!as.maxes || sameMaxes(local.maxes, as.maxes))
    if (contentMatches) { local.synced = true; changed = true; setBase() }
    // Vẫn khác bản server → giữ bản máy như trên, nhưng ghi lại bản server để
    // admin tự quyết "Lấy bản server" (trước đây máy giữ bản cũ mãi, không có
    // cách nào sửa — VD máy admin hiện nội dung 10–11/10 ở buổi 17–18/10 của Phú).
    if (!contentMatches && serverEntry && !sameEntry(local.entry, serverEntry)) {
      const prev = local.serverCopy
      if (!prev || prev.updatedAt !== score?.updatedAt || !sameEntry(prev.entry, serverEntry)) {
        local.serverCopy = { entry: serverEntry, updatedAt: score?.updatedAt }
        changed = true
      }
    } else if (local.serverCopy) { local.serverCopy = undefined; changed = true }
  }

  for (const st of students) {
    const kept = st.sessions.filter((s) => !isMongoid(s.id) || serverIds.has(s.id) || s.dirty)
    if (kept.length !== st.sessions.length) { st.sessions = kept; changed = true }
  }
  if (changed) for (const st of students) st.sessions.sort((a, b) => a.no - b.no)
  return changed
}

/**
 * Gắn bản tạm trên máy (`tempId`, chưa lên server) vào buổi server đã có
 * (`serverId`) — gọi SAU khi server đã xác nhận đã có dữ liệu. Không xóa dữ
 * liệu: máy chưa có bản nào của buổi server → đổi id bản tạm thành id
 * server; máy đã có bản của buổi server mà còn trống → chuyển dữ liệu bản tạm
 * vào đó rồi mới bỏ bản tạm; bản đó đã có dữ liệu → giữ nó, bỏ bản tạm (bản
 * tạm trùng nội dung đã lên server, vẫn còn trong bản chụp sao lưu).
 * Trước đây trùng ngày thì XÓA bản tạm NGAY rồi mới gửi điểm — gửi lỗi là
 * mất cả 2 nơi.
 */
export function adoptServerSession(
  student: { sessions: Session[] },
  tempId: string,
  serverId: string,
  serverNo?: number,
  /** Bản server ĐÃ LƯU XONG — chỉ khi có mới xóa dirty (và chỉ nếu máy chưa
   *  sửa thêm trong lúc gửi). Không truyền = mới tạo buổi, điểm chưa gửi
   *  xong → giữ nguyên dirty (gửi điểm lỗi thì lần sau còn gửi lại). */
  sent?: SentContent,
  serverUpdatedAt?: string,
): void {
  const temp = student.sessions.find((s) => s.id === tempId)
  if (!temp) return
  const twin = student.sessions.find((s) => s.id === serverId)
  if (!twin) {
    temp.id = serverId
    if (serverNo) temp.no = serverNo
    if (sent) {
      temp.synced = true
      if (serverUpdatedAt) temp.baseUpdatedAt = serverUpdatedAt
      if (sameContent(temp, sent)) temp.dirty = false
    }
    return
  }
  if (isBlankEntry(twin.entry)) {
    twin.entry = temp.entry
    if (!twin.homework?.trim()) twin.homework = temp.homework
    if (!twin.maxes) twin.maxes = temp.maxes
  }
  student.sessions = student.sessions.filter((s) => s.id !== tempId)
}

/** Nội dung đã gửi lên server trong 1 lần lưu. */
export interface SentContent { entry: SessionEntry; homework?: string; maxes?: Record<string, number> }

const sameContent = (s: Session, sent: SentContent) =>
  sameEntry(s.entry, sent.entry) && (s.homework ?? '') === (sent.homework ?? '') && sameMaxes(s.maxes, sent.maxes)

/** Server đã xác nhận lưu `sent` cho buổi `sessionId` → đánh dấu synced; CHỈ
 *  xóa cờ dirty nếu nội dung trên máy VẪN đúng là bản đã gửi — giáo viên gõ
 *  thêm trong lúc đang gửi thì vẫn còn dirty để lần sau gửi tiếp (không được
 *  coi là "đã lưu" phần chưa gửi). */
export function markSessionSaved(
  student: { sessions: Session[] },
  sessionId: string,
  sent: SentContent,
  /** `updatedAt` server trả về cho bản vừa lưu — mốc cho lần sửa tiếp theo. */
  serverUpdatedAt?: string,
): void {
  const s = student.sessions.find((x) => x.id === sessionId)
  if (!s) return
  s.synced = true
  if (serverUpdatedAt) s.baseUpdatedAt = serverUpdatedAt
  s.conflict = undefined
  s.serverCopy = undefined
  if (sameContent(s, sent)) s.dirty = false
}

/** Admin chủ động "Lấy bản server" cho 1 buổi dữ liệu cũ đang KHÁC server
 *  (`serverCopy`, xem syncStudentsFromServer). CHỈ đổi trên máy này, không gửi
 *  gì lên server. Bản cũ trên máy được cất vào kho giữ lại (trả về để gọi
 *  appendOrphans) — không mất, vẫn có trong bản chụp sao lưu. Bản cất mang id
 *  riêng: không bao giờ bị đẩy lên (autoSyncOrphans chỉ đẩy id server) và
 *  không bị nhầm với buổi thật khi gộp giữa 2 tab. Buổi đang sửa dở / đang xung
 *  đột / chưa lên server thì không làm gì (trả null). */
export function takeServerCopy(
  cls: { id: string; name: string; students: Array<{ id: string; name: string; sessions: Session[] }> },
  studentId: string,
  sessionId: string,
  now = new Date().toISOString(),
): OrphanRecord | null {
  const st = cls.students.find((x) => x.id === studentId)
  const s = st?.sessions.find((x) => x.id === sessionId)
  if (!st || !s?.serverCopy || s.dirty || s.conflict || !isMongoid(s.id)) return null
  const kept = JSON.parse(JSON.stringify(s)) as Session
  kept.id = `kept-${s.id}-${Date.parse(now)}`
  delete kept.serverCopy
  s.entry = JSON.parse(JSON.stringify(s.serverCopy.entry)) as SessionEntry
  s.baseUpdatedAt = s.serverCopy.updatedAt
  s.synced = true
  s.serverCopy = undefined
  return { classId: cls.id, className: cls.name, studentId: st.id, studentName: st.name, reason: 'replacedByServer', removedAt: now, sessions: [kept] }
}

/** Server từ chối lưu vì máy khác vừa lưu bản mới hơn (409 CONFLICT) — giữ bản
 *  máy kia để giáo viên chọn. Bản trên máy giữ nguyên, vẫn dirty, bộ tự lưu
 *  KHÔNG tự thử lại (phải có người chọn, không tự đè). */
export function markConflict(student: { sessions: Session[] }, sessionId: string, server: SessionConflict): void {
  const s = student.sessions.find((x) => x.id === sessionId)
  if (s) s.conflict = server
}

/** Server từ chối lưu vì buổi đã bị XÓA trên server (409 SESSION_DELETED) mà
 *  máy này vẫn giữ và vừa sửa → tách buổi khỏi id server cũ thành buổi CHƯA
 *  lên server (id tạm mới), giữ nguyên điểm + còn dirty → lần lưu sau tạo lại
 *  buổi theo NGÀY (placeByDate: ngày đó đã có buổi khác thì đi đường trùng
 *  ngày sẵn có, không tạo trùng). Trước đây server nhận ghi vào buổi đã xóa và
 *  báo thành công → điểm biến mất khỏi mọi màn (Phú, Lớp 3, 10/10–11/10). */
export function detachDeletedSession(
  student: { sessions: Session[] },
  sessionId: string,
  newLocalId: string,
  /** Bản điểm vừa định lưu mà bị từ chối (Chấm AI / Duyệt bài nộp tự dựng
   *  entry riêng, chưa ghi vào máy) — giữ lại để lần lưu sau đẩy lên. */
  pendingEntry?: SessionEntry,
): void {
  const s = student.sessions.find((x) => x.id === sessionId)
  if (!s) return
  s.id = newLocalId
  if (pendingEntry) s.entry = pendingEntry
  s.dirty = true
  s.synced = undefined
  s.baseUpdatedAt = undefined
  s.conflict = undefined
  s.serverCopy = undefined
}

/** Giáo viên chọn giữ bản nào khi 2 máy cùng sửa 1 buổi.
 *  - 'mine': giữ bản trên máy này, lần lưu tới ghi đè bản máy kia (đã xem rồi
 *    mới quyết định, không còn là "đè âm thầm").
 *  - 'theirs': lấy bản máy kia, bỏ phần sửa trên máy này. */
export function resolveConflict(student: { sessions: Session[] }, sessionId: string, choice: 'mine' | 'theirs'): void {
  const s = student.sessions.find((x) => x.id === sessionId)
  if (!s?.conflict) return
  s.baseUpdatedAt = s.conflict.updatedAt
  if (choice === 'theirs') {
    s.entry = s.conflict.entry
    s.dirty = false
    s.synced = true
  } else {
    s.dirty = true
  }
  s.conflict = undefined
}

/** Buổi có dữ liệu CHƯA lên server: đã sửa chưa được xác nhận, hoặc chưa từng
 *  lên server mà có nhập gì đó. */
export function hasUnsavedData(s: Session): boolean {
  if (s.dirty === true) return true
  if (isMongoid(s.id)) return false
  const e = s.entry
  return !!s.homework?.trim() || !!(e && (
    e.attendance !== 'present' || e.note?.trim()
    || Object.keys(e.scores ?? {}).length || Object.keys(e.ticks ?? {}).length
    || Object.keys(e.choice ?? {}).length || Object.keys(e.parts ?? {}).length || Object.keys(e.tags ?? {}).length
  ))
}

/** Trước khi gỡ học sinh (không còn trong lớp) / gỡ cả lớp (không còn trên
 *  server) khỏi máy: gom các buổi CHƯA lên server của họ vào kho giữ lại —
 *  trước đây bị xóa luôn cùng học sinh/lớp, mất trắng. Học sinh không có gì
 *  chưa lên thì không tạo bản ghi. */
export function collectOrphans(
  cls: { id: string; name: string; students: Array<{ id: string; name: string; sessions: Session[] }> },
  removedStudentIds: Set<string> | 'all',
  reason: OrphanRecord['reason'],
  now = new Date().toISOString(),
): OrphanRecord[] {
  const out: OrphanRecord[] = []
  for (const st of cls.students) {
    if (removedStudentIds !== 'all' && !removedStudentIds.has(st.id)) continue
    const sessions = st.sessions.filter(hasUnsavedData)
    if (sessions.length) out.push({ classId: cls.id, className: cls.name, studentId: st.id, studentName: st.name, reason, removedAt: now, sessions })
  }
  return out
}

/** Sắp TẠO buổi mới (số `no` chưa có) cho 1 học sinh vào ngày `date` mà em đó
 *  ĐÃ có 1 buổi khác đúng ngày đó → trả về buổi đó (phải chặn, không tạo).
 *  Sự cố thật 18/10 Lớp 5: nhập lượt "18/10" mà ô ngày còn để 17/10 từ lượt
 *  trước → điểm 18/10 của Mina bị lưu thành buổi 17/10 ("nhảy kết quả 17 với
 *  18"); trước đây chỉ hiện cảnh báo rồi vẫn tạo. 1 em không thể học 2 buổi
 *  cùng ngày (server cũng từ chối trùng ngày). */
export function sameDateClash(student: { sessions: Session[] }, no: number, date: string): Session | null {
  if (student.sessions.some((s) => s.no === no)) return null // buổi đã có → đang sửa, không phải tạo mới
  return student.sessions.find((s) => s.date === date) ?? null
}

/** Xóa 1 buổi khỏi máy (màn Sửa số buổi / Thống kê buổi / Lớp học): buổi còn
 *  dữ liệu CHƯA lên server thì trả về bản ghi kho giữ lại (`deletedLocal`) để
 *  lưu trước khi xóa — trước đây chỉ màn Sửa số buổi làm vậy, 2 màn kia xóa
 *  thẳng, mất trắng không nhật ký (đường mất các buổi 17/10 kẹt trên máy Lớp
 *  3/4/5: buổi tạm bị server từ chối vì trùng số, trông như buổi "trùng" nên
 *  bị xóa). Buổi đã lên server và không sửa dở → null (server xóa mềm, khôi
 *  phục được ở "Buổi đã xóa"). */
export function orphanForLocalDelete(
  cls: { id: string; name: string },
  student: { id: string; name: string },
  session: Session,
  now = new Date().toISOString(),
): OrphanRecord | null {
  if (!hasUnsavedData(session)) return null
  return {
    classId: cls.id, className: cls.name, studentId: student.id, studentName: student.name,
    reason: 'deletedLocal', removedAt: now, sessions: [JSON.parse(JSON.stringify(session)) as Session],
  }
}

type LocalData = { classes: Array<{ id: string; name: string; students: Array<{ id: string; name: string; sessions: Session[] }> }>; orphans?: OrphanRecord[] }

/** So 2 bản bất kể thứ tự khóa (bản đọc từ máy đi qua normalize, bản trong bộ
 *  nhớ đi qua immer — thứ tự khóa có thể khác dù nội dung như nhau). */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, y]) => y !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)))
    : x)

const sessionsById = (d: LocalData | null | undefined): Map<string, Session> => {
  const m = new Map<string, Session>()
  for (const c of d?.classes ?? []) for (const st of c.students) for (const s of st.sessions) m.set(s.id, s)
  return m
}

const allSessionIds = (d: LocalData | null | undefined): Set<string> => {
  const ids = new Set<string>()
  for (const c of d?.classes ?? []) for (const st of c.students) for (const s of st.sessions) ids.add(s.id)
  for (const o of d?.orphans ?? []) for (const s of o.sessions) ids.add(s.id)
  return ids
}

/** App mở ở 2 tab cùng máy: mỗi tab ghi CẢ bộ dữ liệu trong bộ nhớ của nó
 *  xuống máy → tab cũ ghi đè mất buổi tab kia vừa tạo. Trước khi tab này ghi,
 *  gộp lại các buổi CHƯA lên server mà tab kia đã ghi xuống (`stored`) nhưng
 *  tab này chưa từng thấy (không có trong `baseline` = bản tab này đọc/ghi lần
 *  cuối) và hiện không có trong bộ nhớ (`mine`). Buổi tab này đã chủ động
 *  bỏ (có trong baseline) thì KHÔNG hồi sinh. Học sinh không còn trên máy này
 *  → vào kho giữ lại (`otherTab`). Buổi CẢ 2 tab đều có: tab kia đã đổi mà
 *  tab này không đụng tới → lấy bản tab kia (gộp 3 chiều); cả 2 cùng đổi và
 *  bản tab kia còn phần chưa lên server → giữ bản tab này, đếm `conflicts` để
 *  cảnh báo. Sửa trực tiếp `mine` (gọi trong produce). (Nghi là đường mất
 *  điểm 17–18/10 Lớp 3/4/5: app cũ không biết có tab khác, tab cũ ghi đè.) */
export function rescueOtherTabSessions(mine: LocalData, stored: LocalData, baseline: LocalData | null): { kept: number; conflicts: number } {
  const seen = allSessionIds(baseline)
  const have = allSessionIds(mine)
  const now = new Date().toISOString()
  let rescued = 0
  let conflicts = 0
  // Buổi cả 2 tab đều có — gộp 3 chiều với bản gốc tab này đọc/ghi lần cuối.
  const base = sessionsById(baseline)
  const other = sessionsById(stored)
  for (const c of mine.classes) {
    for (const st of c.students) {
      st.sessions.forEach((m, i) => {
        const s = other.get(m.id)
        const b = base.get(m.id)
        if (!s || !b) return
        const sj = canon(s)
        const bj = canon(b)
        if (sj === bj || sj === canon(m)) return // tab kia không đổi gì / 2 bên như nhau
        if (canon(m) === bj) { st.sessions[i] = JSON.parse(JSON.stringify(s)) as Session; rescued++ } // chỉ tab kia đổi
        else if (hasUnsavedData(s)) conflicts++ // cả 2 cùng đổi — giữ bản tab này, báo
      })
    }
  }
  const keep = (classId: string, className: string, studentId: string, studentName: string, s: Session) => {
    const st = mine.classes.find((c) => c.id === classId)?.students.find((x) => x.id === studentId)
    if (st) st.sessions.push(JSON.parse(JSON.stringify(s)) as Session)
    else mine.orphans = appendOrphans(mine.orphans, [{ classId, className, studentId, studentName, reason: 'otherTab', removedAt: now, sessions: [s] }])
    have.add(s.id)
    rescued++
  }
  for (const c of stored.classes ?? []) {
    for (const st of c.students ?? []) {
      for (const s of st.sessions ?? []) {
        if (seen.has(s.id) || have.has(s.id) || !hasUnsavedData(s)) continue
        keep(c.id, c.name, st.id, st.name, s)
      }
    }
  }
  for (const o of stored.orphans ?? []) {
    const fresh = o.sessions.filter((s) => !seen.has(s.id) && !have.has(s.id))
    if (fresh.length) { mine.orphans = appendOrphans(mine.orphans, [{ ...o, sessions: fresh }]); fresh.forEach((s) => have.add(s.id)); rescued += fresh.length }
  }
  if (rescued) for (const c of mine.classes) for (const st of c.students) st.sessions.sort((a, b) => a.no - b.no)
  return { kept: rescued, conflicts }
}

/** "Số câu" (`maxes`) máy này có mà server còn TRỐNG → cần điền lên. Trước
 *  21/10 số câu chỉ lưu trên máy giáo viên (server chỉ có 1/917 buổi): mọi máy
 *  khác + màn phụ huynh tính % theo số câu MẶC ĐỊNH (VD "Nghe 37/20"). Bản sửa
 *  21/10 chỉ gửi số câu khi buổi được sửa lại → buổi cũ không bao giờ tự lên.
 *  Bỏ qua buổi đang sửa dở (dirty — lần lưu tới tự gửi số câu) và buổi chưa
 *  lên server. Server chỉ điền khi đang trống (`maxesIfAbsent`), không ghi đè. */
export function maxesToBackfill(
  students: Array<{ sessions: Session[] }>,
  serverSessions: Array<{ _id: string; maxes?: Record<string, number> | null }>,
): Array<{ sessionId: string; maxes: Record<string, number> }> {
  const serverEmpty = new Set(serverSessions.filter((s) => !s.maxes || !Object.keys(s.maxes).length).map((s) => s._id))
  const out: Array<{ sessionId: string; maxes: Record<string, number> }> = []
  for (const st of students) {
    for (const s of st.sessions) {
      if (!isMongoid(s.id) || s.dirty || !serverEmpty.has(s.id)) continue
      const valid = Object.entries(s.maxes ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0)
      if (valid.length) out.push({ sessionId: s.id, maxes: Object.fromEntries(valid) })
    }
  }
  return out
}

/** Thêm bản ghi vào kho giữ lại, KHÔNG trùng (cùng lớp + học sinh thì gộp,
 *  buổi đã có trong kho thì bỏ qua) — hiệu ứng đồng bộ có thể chạy lại. */
export function appendOrphans(existing: OrphanRecord[] | undefined, incoming: OrphanRecord[]): OrphanRecord[] {
  const out = (existing ?? []).map((o) => ({ ...o, sessions: [...o.sessions] }))
  for (const inc of incoming) {
    const same = out.find((o) => o.classId === inc.classId && o.studentId === inc.studentId)
    if (!same) { out.push({ ...inc, sessions: [...inc.sessions] }); continue }
    for (const s of inc.sessions) if (!same.sessions.some((x) => x.id === s.id)) same.sessions.push(s)
  }
  return out
}

/** Các buổi máy này đã sửa mà server chưa xác nhận (hoặc chưa từng lên
 *  server) — việc của bộ tự lưu nền ở Nhập điểm. */
export function pendingSessionsOf(students: Array<{ id: string; sessions: Session[] }>): Array<{ studentId: string; sessionId: string }> {
  const out: Array<{ studentId: string; sessionId: string }> = []
  for (const st of students) {
    if (!isMongoid(st.id)) continue
    // Buổi đang xung đột (2 máy cùng sửa) chờ người chọn — không tự gửi lại.
    for (const s of st.sessions) if (s.dirty === true && !s.conflict) out.push({ studentId: st.id, sessionId: s.id })
  }
  return out
}
