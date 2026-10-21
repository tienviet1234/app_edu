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

/** Người được ghi là "đã tạo buổi" — admin đẩy hộ từ bản chụp máy giáo viên
 *  thì ghi đúng giáo viên đó (Thống kê buổi/lương tính theo người tạo). Chỉ
 *  admin mới được chỉ định người khác. */
export function resolveSessionCreator(role: string | undefined, userId: string, onBehalfOf?: string): string {
  return role === 'admin' && onBehalfOf ? onBehalfOf : userId
}
