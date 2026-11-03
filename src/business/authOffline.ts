/**
 * Giữ phiên làm việc khi MẤT MẠNG. Trước đây lỗi gia hạn đăng nhập nào cũng bị
 * coi là "đã đăng xuất": mở/tải lại app lúc mất mạng → về màn đăng nhập, giáo
 * viên tưởng mất hết buổi vừa nhập (báo thật 24/10, Lớp 8 buổi 23–24/10) dù
 * dữ liệu vẫn nằm trên máy.
 */

/** 'unreachable' = không hỏi được server (mất mạng, hết giờ, server đang khởi
 *  động/lỗi) → GIỮ phiên. 'rejected' = server trả lời rõ phiên không còn hợp
 *  lệ → đăng xuất thật. Lỗi không phải từ mạng (dữ liệu trả về sai) cũng là
 *  'rejected': không bao giờ giữ phiên khi không chắc. */
export function classifyAuthFailure(err: unknown): 'unreachable' | 'rejected' {
  const e = err as { isAxiosError?: boolean; response?: { status?: number } } | null | undefined
  const status = e?.response?.status
  if (status === undefined) return e?.isAxiosError ? 'unreachable' : 'rejected'
  return status >= 500 || status === 408 || status === 429 ? 'unreachable' : 'rejected'
}

/** Chỉ giáo viên/admin mới cần làm việc khi mất mạng (nhập điểm lưu trên máy).
 *  Không giữ thông tin tài khoản học sinh/phụ huynh trên máy. */
export function canKeepOfflineSession(user: { role?: string } | null | undefined): boolean {
  return user?.role === 'teacher' || user?.role === 'admin'
}
