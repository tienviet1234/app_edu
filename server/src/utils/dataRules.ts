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
