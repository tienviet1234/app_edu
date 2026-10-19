import { isMongoid } from '@/utils/mongoid'

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
