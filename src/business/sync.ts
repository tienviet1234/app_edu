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
