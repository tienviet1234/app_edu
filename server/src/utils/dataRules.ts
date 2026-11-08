/**
 * Quy tắc an toàn dữ liệu ở server — tách thành hàm thuần để có test (mỗi
 * quy tắc là 1 sự cố thật đã gặp, xem dataRules.test.ts).
 */

type IdLike = { toString(): string } | string

/** classId của 1 điểm LẤY THEO BUỔI HỌC, không tin classId máy gửi lên — máy
 *  giữ bản cũ (học sinh vừa được gộp/chuyển lớp, buổi đã chuyển sang lớp mới)
 *  gửi classId lớp CŨ sẽ kéo điểm về lớp cũ → điểm "biến mất" khỏi lớp mới. */
export function resolveScoreClassId(session: { classId?: IdLike } | null | undefined, bodyClassId: string): string {
  return session?.classId ? String(session.classId) : bodyClassId
}

export type IfAbsentDecision = 'write' | 'skipDeleted' | 'skipExisting'

/** Upsert điểm với `ifAbsent` (đồng bộ nền / khôi phục từ bản chụp): KHÔNG
 *  BAO GIỜ ghi đè điểm đã có, không ghi vào buổi đã xóa/không tồn tại.
 *  Trước đây đồng bộ nền gửi đè vô điều kiện → máy giữ bản cũ đè mất điểm
 *  mới hơn của máy khác (nhật ký 20/10: 1 máy đè 82 điểm mỗi lần F5). */
export function decideIfAbsent(
  session: { deletedAt?: Date | null } | null | undefined,
  existingScore: unknown,
): IfAbsentDecision {
  if (!session || session.deletedAt) return 'skipDeleted'
  if (existingScore) return 'skipExisting'
  return 'write'
}

/** Lưu điểm THẬT (giáo viên đang sửa, không phải `ifAbsent`) vào buổi đã bị
 *  xóa / không tồn tại → phải từ chối. Trước đây server vẫn ghi và trả "thành
 *  công" → điểm nằm trong buổi đã xóa, không màn nào hiện ra nữa (sự cố thật
 *  18/10 Lớp 3: máy cô Trà lưu điểm 10/10 + 11/10 của Phú vào 2 buổi admin đã
 *  xóa từ 16/10 — máy báo "Đã lưu", điểm biến mất khỏi mọi nơi). */
export function isWriteToDeletedSession(session: { deletedAt?: Date | null } | null | undefined): boolean {
  return !session || !!session.deletedAt
}

/** 2 máy cùng sửa 1 buổi: máy gửi kèm `baseUpdatedAt` = thời điểm bản điểm
 *  trên server mà nó đã dựa vào để sửa. Server đã có bản MỚI HƠN thế (máy khác
 *  vừa lưu) → ghi lúc này là đè mất phần máy kia vừa sửa ("bản lưu sau thắng")
 *  → từ chối, để giáo viên chọn giữ bản nào. Không gửi base (buổi mới, dữ liệu
 *  cũ) → không kiểm tra được, ghi như trước. */
export function isStaleWrite(existingUpdatedAt: Date | string | undefined | null, baseUpdatedAt: string | undefined | null): boolean {
  if (!baseUpdatedAt || !existingUpdatedAt) return false
  const base = new Date(baseUpdatedAt).getTime()
  if (Number.isNaN(base)) return false
  return new Date(existingUpdatedAt).getTime() > base
}

/** Học sinh còn trong lớp không — tạo buổi kiểu placeByDate (đồng bộ nền /
 *  khôi phục) cho học sinh đã gộp/chuyển khỏi lớp sẽ hồi sinh dữ liệu cũ. */
export function isStudentInClass(cls: { studentIds?: IdLike[] } | null | undefined, studentId: string): boolean {
  return !!cls?.studentIds?.some((id) => String(id) === String(studentId))
}

/** Các ô nội dung của 1 điểm (không tính `total` — tính lại theo phiếu chấm). */
const SCORE_CONTENT_FIELDS = ['attendance', 'scores', 'tags', 'ticks', 'choice', 'parts', 'skip', 'ev', 'note'] as const

/** Trải phẳng nội dung điểm thành "đường dẫn → giá trị" để so từng ô — bỏ ô
 *  trống, "8" = 8, thứ tự tick không quan trọng, "có mặt" là mặc định. */
export function flattenScoreContent(score: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (v: unknown, path: string) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k)
    } else if (Array.isArray(v)) {
      if (v.length) out[path] = JSON.stringify([...v].map(String).sort())
    } else if (v !== undefined && v !== null && v !== '' && v !== false) {
      const s = typeof v === 'string' ? v.trim() : v
      if (s === '') return
      out[path] = typeof s === 'string' && !Number.isNaN(Number(s)) ? String(Number(s)) : JSON.stringify(s)
    }
  }
  for (const f of SCORE_CONTENT_FIELDS) walk(score?.[f], f)
  if (out.attendance === '"present"') delete out.attendance
  return out
}

/** Khôi phục 1 điểm từ bản sao lưu/bản chụp máy chỉ an toàn khi bản khôi phục
 *  CHỨA TRỌN bản hiện tại: mọi ô đang có giữ nguyên giá trị (ghi chú được phép
 *  dài thêm ở cuối — bản bị đè thường là ghi chú cắt ngắn). Ai đó đã sửa buổi
 *  sau khi bị đè → bản hiện tại có ô khác/mới → không khôi phục, để người xem.
 *  (Sự cố thật 19–20/10: máy giữ bản cũ đẩy đè mất Mini/Nghe/tích của Lớp 7,
 *  Lớp 10 — khôi phục không được làm mất thêm bất kỳ ô nào đang có.) */
export function checkScoreRestore(
  current: Record<string, unknown> | null | undefined,
  target: Record<string, unknown>,
): { ok: true; added: string[] } | { ok: false; reason: string } {
  const cur = flattenScoreContent(current)
  const tgt = flattenScoreContent(target)
  for (const [k, v] of Object.entries(cur)) {
    if (tgt[k] === v) continue
    const curNote = k === 'note' ? (JSON.parse(v) as string) : null
    const tgtNote = k === 'note' && tgt[k] ? (JSON.parse(tgt[k]) as string) : null
    if (curNote !== null && tgtNote !== null && tgtNote.startsWith(curNote)) continue
    return { ok: false, reason: `ô "${k}" hiện có ${v}, bản khôi phục ${tgt[k] ?? 'không có'} — sẽ làm mất dữ liệu đang có` }
  }
  const added = Object.keys(tgt).filter((k) => cur[k] !== tgt[k])
  if (!added.length) return { ok: false, reason: 'bản hiện tại đã đủ — không cần khôi phục' }
  return { ok: true, added }
}

/** Ô nào khác nhau giữa 2 bản điểm — trang "Lịch sử điểm" của admin hiện
 *  "ô X: A → B" cho từng lần sửa (cùng cách so như flattenScoreContent: bỏ ô
 *  trống, "8" = 8, thứ tự tick không quan trọng). */
export function scoreFieldChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Array<{ field: string; before: string | null; after: string | null }> {
  const a = flattenScoreContent(before)
  const b = flattenScoreContent(after)
  const show = (v: string | undefined) => (v === undefined ? null : v.startsWith('"') ? (JSON.parse(v) as string) : v)
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    .filter((k) => a[k] !== b[k])
    .map((field) => ({ field, before: show(a[field]), after: show(b[field]) }))
}

/** Giá trị ghi lại khi admin khôi phục 1 phiên bản điểm cũ — CHỈ nội dung +
 *  tổng (không đổi buổi/học sinh/lớp/người chấm); ô bản cũ không có thì để
 *  trống đúng như bản cũ, không giữ lại ô của bản hiện tại. */
export function scoreRestoreSet(before: Record<string, unknown>): Record<string, unknown> {
  return {
    attendance: before.attendance ?? 'present',
    scores: before.scores ?? {}, tags: before.tags ?? {}, ticks: before.ticks ?? {},
    choice: before.choice ?? {}, parts: before.parts ?? {}, skip: before.skip ?? {}, ev: before.ev ?? {},
    note: before.note ?? '',
    total: typeof before.total === 'number' ? before.total : 0,
  }
}

const nonEmpty = (v: unknown): boolean =>
  v !== '' && v != null && v !== false && !(Array.isArray(v) && !v.length)
  && !(typeof v === 'object' && !Array.isArray(v) && !Object.values(v as Record<string, unknown>).some(nonEmpty))

/** Buổi có CHẤM ĐIỂM thật không — có ít nhất 1 ô điểm / tích / lựa chọn /
 *  phần nhỏ / "không làm" (skip). Buổi chỉ có ghi chú hoặc chỉ điểm danh
 *  KHÔNG phải điểm 0: app lưu tổng = 0 cho các buổi này (`sessionScore` trả
 *  null → `?? 0`), trước đây màn phụ huynh + thống kê cộng vào điểm TB như 0
 *  điểm, kéo điểm phụ huynh thấy xuống (VD buổi admin thêm bù 12–13/09 chỉ
 *  có ghi chú). Vắng không phép = 0 điểm thật; vắng có phép = không tính. */
export function isGradedScore(sc: Record<string, unknown> | null | undefined): boolean {
  const att = (sc?.attendance as string | undefined) ?? 'present'
  if (att === 'absent') return true
  if (att === 'excused') return false
  return ['scores', 'ticks', 'choice', 'parts', 'skip'].some((f) => nonEmpty(sc?.[f]))
}

/** Tổng điểm để HIỂN THỊ / tính điểm TB: null khi buổi không có điểm thật
 *  (chưa chấm, vắng có phép) — không được hiện/cộng như 0 điểm. */
export function gradedTotal(sc: Record<string, unknown> | null | undefined): number | null {
  if (!isGradedScore(sc)) return null
  const t = Number(sc?.total)
  return Number.isFinite(t) ? t : 0
}

const REJECT_KEEP =['classId', 'studentId', 'sessionId', 'lessonNo', 'scheduledAt', 'placeByDate', 'baseUpdatedAt', 'total', ...SCORE_CONTENT_FIELDS] as const

/** Nhật ký 1 lần server TỪ CHỐI lưu buổi/điểm — giữ cả NỘI DUNG bị từ chối.
 *  Sự cố thật 18/10: tạo buổi 17–18/10 bị từ chối (trùng số), server không ghi
 *  gì, điểm chỉ còn trên máy giáo viên rồi mất hẳn — không ai biết, không còn
 *  nơi nào để lấy lại. Giờ bị từ chối là có bản trên server (nhật ký). Chỉ giữ
 *  các trường dữ liệu học tập đã biết, ghi chú/bài tập cắt bớt cho gọn. */
export function rejectedWriteMetadata(code: string, body: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { code }
  for (const k of REJECT_KEEP) {
    const v = body?.[k]
    if (v === undefined || v === null || v === '') continue
    out[k] = typeof v === 'string' ? v.slice(0, 1000) : v
  }
  if (typeof body?.notes === 'string' && body.notes) out.notes = body.notes.slice(0, 1000)
  return out
}

/** Người được ghi là "đã tạo buổi" — admin đẩy hộ từ bản chụp máy giáo viên
 *  thì ghi đúng giáo viên đó (Thống kê buổi/lương tính theo người tạo). Chỉ
 *  admin mới được chỉ định người khác. */
export function resolveSessionCreator(role: string | undefined, userId: string, onBehalfOf?: string): string {
  return role === 'admin' && onBehalfOf ? onBehalfOf : userId
}

export interface StudentTuitionInput { mode: 'rate' | 'percent'; value: number; reason: string }

/** Học phí RIÊNG 1 học sinh trong lớp (admin đặt — giảm em này, tăng em kia).
 *  2 kiểu để tiền TỪNG BUỔI luôn khớp tổng: 'rate' = giá riêng/buổi (đồng,
 *  số nguyên 0–100.000.000); 'percent' = giảm/tăng % trên giá lớp (−100…+100,
 *  khác 0, tối đa 2 chữ số thập phân). Lý do BẮT BUỘC (hồ sơ tiền bạc). */
export function checkStudentTuitionInput(body: unknown): { ok: true; rule: StudentTuitionInput } | { ok: false; message: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  const value = typeof b.value === 'number' ? b.value : Number.NaN
  if (b.mode !== 'rate' && b.mode !== 'percent') return { ok: false, message: 'Chọn kiểu: giá riêng/buổi hoặc giảm/tăng %.' }
  if (!Number.isFinite(value)) return { ok: false, message: 'Số tiền/phần trăm không hợp lệ.' }
  if (b.mode === 'rate' && (!Number.isInteger(value) || value < 0 || value > 100_000_000)) return { ok: false, message: 'Giá riêng/buổi phải là số đồng nguyên từ 0 đến 100.000.000.' }
  if (b.mode === 'percent' && (value === 0 || value < -100 || value > 100 || Math.round(value * 100) !== value * 100)) return { ok: false, message: 'Phần trăm phải từ −100 đến +100 (khác 0, tối đa 2 chữ số thập phân).' }
  if (!reason) return { ok: false, message: 'Phải ghi lý do giảm/tăng học phí.' }
  if (reason.length > 200) return { ok: false, message: 'Lý do tối đa 200 ký tự.' }
  return { ok: true, rule: { mode: b.mode, value, reason } }
}

/** Giá/buổi THỰC của 1 học sinh: giá riêng, hoặc giá lớp ± %, làm tròn tới
 *  đồng; không bao giờ âm. CÙNG công thức với effectiveRateOf ở frontend
 *  (src/business/tuition.ts) — sửa 1 chỗ phải sửa cả 2 (cả 2 đều có test). */
export function effectiveTuitionRate(classRate: number, rule?: { mode: string; value: number } | null): number {
  if (!rule) return classRate
  if (rule.mode === 'rate') return Math.max(0, Math.round(rule.value))
  if (rule.mode === 'percent') return Math.max(0, Math.round(classRate * (1 + rule.value / 100)))
  return classRate
}

export type NoticeSessionsCheck =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'WRONG_STUDENT' | 'DELETED' | 'ALREADY_BILLED'; sessionIds: string[] }

/** Phiếu học phí kèm danh sách buổi nó thu — server kiểm tra trước khi tạo
 *  phiếu + đánh dấu "đã thu" trong cùng 1 giao dịch. Từ chối nếu buổi không
 *  tồn tại / không phải của học sinh-lớp này / đã xóa / ĐÃ nằm trong 1 phiếu
 *  khác (thu trùng tiền). Trước đây máy tự đánh dấu từng buổi sau khi tạo
 *  phiếu: buổi còn nằm trên máy (chưa lên server) bị bỏ qua im lặng → kỳ sau
 *  thu lại (sự cố thật: Lớp 7 phiếu 16/10, Vương Thắng 12/09, Tuấn 17/09). */
export function checkNoticeSessions(input: {
  studentId: string
  classId: string
  requested: string[]
  sessions: Array<{ _id: IdLike; studentId?: IdLike; classId?: IdLike; deletedAt?: Date | null }>
  /** sessionIds của các phiếu ĐÃ CÓ của học sinh này. */
  alreadyNoticed: IdLike[]
}): NoticeSessionsCheck {
  const byId = new Map(input.sessions.map((s) => [String(s._id), s]))
  const missing = input.requested.filter((id) => !byId.has(id))
  if (missing.length) return { ok: false, code: 'NOT_FOUND', sessionIds: missing }
  const wrong = input.requested.filter((id) => {
    const s = byId.get(id)!
    return String(s.studentId) !== input.studentId || String(s.classId) !== input.classId
  })
  if (wrong.length) return { ok: false, code: 'WRONG_STUDENT', sessionIds: wrong }
  const deleted = input.requested.filter((id) => byId.get(id)!.deletedAt)
  if (deleted.length) return { ok: false, code: 'DELETED', sessionIds: deleted }
  const noticed = new Set(input.alreadyNoticed.map(String))
  const dup = input.requested.filter((id) => noticed.has(id))
  if (dup.length) return { ok: false, code: 'ALREADY_BILLED', sessionIds: dup }
  return { ok: true }
}

/** Lần bấm chuyển em (`score.entry`) khi em CHƯA có buổi (`sessionNo` 0), mà tới
 *  giờ em đó vẫn không có buổi đúng ngày bấm — dấu hiệu tưởng đã điểm danh nhưng
 *  không có gì được lưu (sự cố thật Lớp 7: 29/10 thiếu 8 em, 03/11 thiếu 10 em).
 *  Đối chiếu theo TỪNG EM: cách cũ "tài khoản có lưu gì đó trong 2 phút" che mất
 *  các em này vì trong cùng lượt bấm có em khác được lưu. */
export function navClicksWithoutSession<T extends { className: string; studentName: string; date: string; sessionNo?: number }>(
  clicks: T[],
  sessions: Array<{ className: string; studentName: string; date: string }>,
): T[] {
  const has = new Set(sessions.map((s) => `${s.className}|${s.studentName}|${s.date}`))
  const seen = new Set<string>()
  return clicks.filter((c) => {
    const key = `${c.className}|${c.studentName}|${c.date}`
    if (c.sessionNo !== 0 || has.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export type DuplicateFixOp =
  | { kind: 'delete'; id: string; wasBilled: boolean }
  | { kind: 'bill'; id: string }
  | { kind: 'renumber'; id: string; from: number; to: number }
  | { kind: 'notes'; id: string; value: string }

/** Kế hoạch dọn 1 cặp buổi TRÙNG NGÀY của 1 học sinh (bỏ `dropId`, giữ
 *  `keepId`) — từ chối thay vì đoán khi dữ liệu không đúng như lúc duyệt.
 *  Quy tắc (rà soát 24/10):
 *   - bản bỏ đang mang dấu "đã thu" → dấu chuyển sang bản giữ (cùng 1 buổi đã
 *     nằm trong phiếu; chỉ xóa thì bản giữ thành "chưa thu", bị thu lần 2);
 *   - `extraBillId`: phiếu kiểu cũ đã đếm CẢ 2 bản → buổi CHƯA THU SỚM NHẤT kế
 *     tiếp nằm trong số tiền đã thu (giữ đúng số buổi đã trả, như lần sửa 23/10);
 *   - số buổi mang dấu "đã thu" sau khi sửa PHẢI bằng tổng số buổi trên phiếu;
 *   - bản bỏ không được nằm trong danh sách buổi của phiếu nào (phiếu mới);
 *   - đánh lại số 1..n theo ngày cho các buổi còn lại, chỉ khi số trước ngày
 *     trùng đã liền nhau (lệch từ trước → không tự đánh, báo để xem tay). */
export function planDuplicateFix(input: {
  /** Buổi CÒN HIỆU LỰC của học sinh-lớp, đã sắp theo ngày rồi số buổi. */
  live: Array<{ id: string; lessonNo: number; date: string; billed?: boolean; notes?: string }>
  date: string
  keepId: string
  dropId: string
  /** Tổng `sessionsBilled` các phiếu của học sinh-lớp; null = chưa có phiếu. */
  paidSessions: number | null
  noticedIds: string[]
  extraBillId?: string
  copyNotes?: boolean
}): { ok: true; ops: DuplicateFixOp[] } | { ok: false; reason: string } {
  const onDate = input.live.filter((s) => s.date === input.date)
  const keep = onDate.find((s) => s.id === input.keepId)
  const drop = onDate.find((s) => s.id === input.dropId)
  if (onDate.length !== 2 || !keep || !drop) return { ok: false, reason: `ngày ${input.date} có ${onDate.length} buổi, không khớp đúng cặp giữ/bỏ` }
  if (input.noticedIds.includes(drop.id)) return { ok: false, reason: 'bản bỏ nằm trong danh sách buổi của 1 phiếu học phí' }
  const ops: DuplicateFixOp[] = [{ kind: 'delete', id: drop.id, wasBilled: !!drop.billed }]
  const billed = new Set(input.live.filter((s) => s.billed && s.id !== drop.id).map((s) => s.id))
  if (drop.billed) {
    if (keep.billed) return { ok: false, reason: 'cả 2 bản đều đã thu — không tự chuyển dấu' }
    ops.push({ kind: 'bill', id: keep.id })
    billed.add(keep.id)
  }
  const rest = input.live.filter((s) => s.id !== drop.id)
  if (input.extraBillId) {
    const firstUnbilled = rest.find((s) => !billed.has(s.id))
    if (!firstUnbilled || firstUnbilled.id !== input.extraBillId) return { ok: false, reason: 'buổi tính bù không phải buổi chưa thu sớm nhất' }
    ops.push({ kind: 'bill', id: firstUnbilled.id })
    billed.add(firstUnbilled.id)
  }
  if (input.paidSessions != null && billed.size !== input.paidSessions) {
    return { ok: false, reason: `sau khi sửa có ${billed.size} buổi mang dấu đã thu ≠ ${input.paidSessions} buổi trên phiếu` }
  }
  if (input.copyNotes) {
    if ((keep.notes ?? '').trim()) return { ok: false, reason: 'bản giữ đã có bài tập về nhà — không chép đè' }
    if (!(drop.notes ?? '').trim()) return { ok: false, reason: 'bản bỏ không có bài tập về nhà để chép' }
    ops.push({ kind: 'notes', id: keep.id, value: drop.notes! })
  }
  const firstBad = rest.findIndex((s, i) => s.lessonNo !== i + 1)
  if (firstBad >= 0 && rest[firstBad].date < input.date) return { ok: false, reason: `số buổi đã lệch từ trước (${rest[firstBad].date} là Buổi ${rest[firstBad].lessonNo})` }
  rest.forEach((s, i) => { if (s.lessonNo !== i + 1) ops.push({ kind: 'renumber', id: s.id, from: s.lessonNo, to: i + 1 }) })
  return { ok: true, ops }
}

/** Buổi đã nằm trong số tiền đã thu thì không xóa được: xóa là mất dấu "đã thu",
 *  buổi còn lại (VD bản kia của 1 cặp trùng ngày) thành "chưa thu" và bị tính tiền
 *  lần 2. Sự cố thật 08/11: 11 em lệch, Lớp 2 mới Buổi 5–7 đã báo đủ 8 buổi. */
export function billedDeleteBlockReason(session: { billed?: boolean | null }): string | null {
  return session.billed
    ? 'Buổi này đã thu tiền nên không xóa được (xóa sẽ làm buổi khác bị tính tiền lần 2). Cần bỏ buổi này thì báo admin chuyển dấu "đã thu" sang buổi đúng trước.'
    : null
}

/** Kế hoạch đánh dấu bù "đã thu" khi phiếu học phí kiểu cũ đã thu N buổi mà ít
 *  hơn N buổi mang dấu. Lấy các buổi chưa thu SỚM NHẤT theo ngày: phiếu kiểu cũ thu
 *  theo thứ tự từ buổi đầu. Từ chối thay vì đoán: có phiếu kiểu mới (đã có danh
 *  sách buổi chính xác), thừa dấu, hoặc không đủ buổi (em đã chuyển lớp). */
export function planBilledFlagRepair(input: {
  live: Array<{ id: string; date: string; no: number; billed?: boolean }>
  notices: Array<{ sessionsBilled?: number; sessionIds?: string[] }>
}): { ok: true; ids: string[]; paid: number; flagged: number } | { ok: false; reason: string } {
  const paid = input.notices.reduce((n, x) => n + (x.sessionsBilled ?? 0), 0)
  const flagged = input.live.filter((s) => s.billed).length
  if (flagged === paid) return { ok: true, ids: [], paid, flagged }
  if (input.notices.some((n) => n.sessionIds?.length)) return { ok: false, reason: 'có phiếu kiểu mới (đã ghi đúng từng buổi), không tự đánh dấu' }
  if (flagged > paid) return { ok: false, reason: `thừa dấu: phiếu thu ${paid} buổi nhưng ${flagged} buổi mang dấu đã thu` }
  const missing = paid - flagged
  const unbilled = input.live.filter((s) => !s.billed).sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
  if (unbilled.length < missing) return { ok: false, reason: `phiếu thu ${paid} buổi nhưng em chỉ còn ${input.live.length} buổi trong lớp (có thể đã chuyển lớp)` }
  return { ok: true, ids: unbilled.slice(0, missing).map((s) => s.id), paid, flagged }
}

/** Lớp đã có buổi học thì không được xóa: buổi, điểm, học phí đều neo vào lớp, xóa
 *  là mồ côi hết, không màn nào hiện nữa. Lớp thôi học thì đổi trạng thái. */
export function classDeleteBlockReason(sessionCount: number): string | null {
  return sessionCount > 0
    ? `Lớp này đã có ${sessionCount} buổi học nên không xóa được, để giữ điểm và học phí. Lớp thôi học thì đổi trạng thái sang "Đã kết thúc".`
    : null
}

/** Kế hoạch ghi bù 1 buổi CHỈ CÓ ĐIỂM DANH cho 1 học sinh (bản app cũ bấm "Xác
 *  nhận" khi em chưa có buổi thì không lưu — Lớp 7 ngày 29/10). Xếp đúng vị trí
 *  theo ngày như `placeByDate`: buổi sau ngày đó tăng 1 số, buổi trước không đổi.
 *  Từ chối thay vì đoán khi dữ liệu không như lúc duyệt:
 *   - đã có buổi đúng ngày (giáo viên vừa nhập bù, hoặc chạy lại lần 2);
 *   - không có dấu vết bấm chuyển em "chưa có buổi" đúng ngày đó;
 *   - em có buổi ở lớp khác (số buổi tính theo học sinh, đánh lại dễ trùng);
 *   - số buổi hiện tại không liền nhau 1..n theo ngày;
 *   - phiếu kiểu cũ đã thu theo VỊ TRÍ mà buổi mới chen vào phần đã thu (làm lệch
 *     kỳ đã thu, buổi chưa thu cuối kỳ bị coi là đã thu). */
export function planAttendanceBackfill(input: {
  /** Buổi CÒN HIỆU LỰC của học sinh-lớp, đã sắp theo ngày rồi số buổi. */
  live: Array<{ id: string; lessonNo: number; date: string; billed?: boolean }>
  date: string
  clickedWithoutSession: boolean
  otherClassSessions: number
  /** `periodTo` lớn nhất của phiếu kiểu cũ (không có danh sách buổi); null = không có. */
  legacyPaidThrough: number | null
}): { ok: true; lessonNo: number; renumbers: Array<{ id: string; from: number; to: number }> } | { ok: false; reason: string } {
  if (input.live.some((s) => s.date === input.date)) return { ok: false, reason: `đã có buổi ngày ${input.date}` }
  if (!input.clickedWithoutSession) return { ok: false, reason: `không có dấu vết bấm chuyển em ngày ${input.date}` }
  if (input.otherClassSessions > 0) return { ok: false, reason: `em có ${input.otherClassSessions} buổi ở lớp khác` }
  const wrong = input.live.findIndex((s, i) => s.lessonNo !== i + 1)
  if (wrong >= 0) return { ok: false, reason: `số buổi đã lệch từ trước (${input.live[wrong].date} là Buổi ${input.live[wrong].lessonNo}, đúng ra ${wrong + 1})` }
  const position = input.live.filter((s) => s.date < input.date).length
  const anyBilled = input.live.some((s) => s.billed)
  if (!anyBilled && input.legacyPaidThrough != null && position < input.legacyPaidThrough) {
    return { ok: false, reason: `buổi mới rơi vào phần phiếu kiểu cũ đã thu (vị trí ${position + 1}, đã thu tới ${input.legacyPaidThrough})` }
  }
  return {
    ok: true,
    lessonNo: position + 1,
    renumbers: input.live.slice(position).map((s) => ({ id: s.id, from: s.lessonNo, to: s.lessonNo + 1 })),
  }
}
