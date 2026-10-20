import { api } from '@/utils/api'

export interface ApiSession {
  _id: string
  classId: string
  studentId?: string
  createdBy?: string | { _id: string; name: string }
  centerId?: string
  courseId?: string
  title?: string
  lessonNo?: number
  scheduledAt: string
  durationMinutes: number
  status: 'scheduled' | 'completed' | 'cancelled'
  /** Lưu "Bài tập về nhà" riêng của học sinh buổi này — field tên "notes" có
   *  sẵn trong model nhưng trước đây không nơi nào dùng tới. */
  notes?: string
  /** Buổi này ĐÃ tính tiền (đã gửi khoản học phí, hoặc admin tự xác nhận đã
   *  thu trước đó) — xem ghi chú ở business/tuition.ts unbilledSessionsOf. */
  billed?: boolean
  /** "Số câu" riêng buổi này — xem ClassSession.maxes ở server. */
  maxes?: Record<string, number>
  createdAt: string
  updatedAt: string
}

interface PagedData<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export const sessionService = {
  list: (params?: Record<string, string>) =>
    api
      .get<{ data: PagedData<ApiSession> }>('/sessions', { params })
      .then((r) => r.data.data),

  create: (body: {
    classId: string
    studentId?: string
    title?: string
    lessonNo?: number
    scheduledAt?: string
    durationMinutes?: number
    notes?: string
    maxes?: Record<string, number>
    /** Đẩy buổi KẸT trên máy lên — server tự xếp đúng vị trí theo ngày,
     *  không từ chối vì trùng số (409 SAME_DATE nếu đã có buổi cùng ngày). */
    placeByDate?: boolean
    /** Chỉ admin: ghi giáo viên này là người tạo buổi (khôi phục hộ từ bản
     *  chụp máy giáo viên — Thống kê buổi/lương tính theo người tạo). */
    onBehalfOf?: string
  }) =>
    api.post<{ data: ApiSession }>('/sessions', body).then((r) => r.data.data),

  /** Mọi buổi (chưa xóa) khớp bộ lọc — server cắt 100 dòng/trang. */
  listAll: async (params: Record<string, string>) => {
    const items: ApiSession[] = []
    for (let page = 1; page <= 100; page++) {
      const r = await sessionService.list({ ...params, limit: '100', page: String(page) })
      items.push(...r.items)
      if (!r.items.length || items.length >= r.total) break
    }
    return items
  },

  get: (id: string) =>
    api.get<{ data: ApiSession }>(`/sessions/${id}`).then((r) => r.data.data),

  update: (id: string, body: { title?: string; lessonNo?: number; scheduledAt?: string; durationMinutes?: number; notes?: string; billed?: boolean; maxes?: Record<string, number> }) =>
    api.patch<{ data: ApiSession }>(`/sessions/${id}`, body).then((r) => r.data.data),

  remove: (id: string) =>
    api.delete<{ data: { deleted: boolean } }>(`/sessions/${id}`).then((r) => r.data.data),

  /** Khôi phục 1 buổi đã "xóa" (soft delete) — điểm/bài tập/ghi chú/điểm danh
   *  chưa từng bị động tới nên trở lại y hệt trước khi xóa. */
  restore: (id: string) =>
    api.post<{ data: ApiSession }>(`/sessions/${id}/restore`, {}).then((r) => r.data.data),

  complete: (id: string) =>
    api.post<{ data: ApiSession }>(`/sessions/${id}/complete`, {}).then((r) => r.data.data),

  /** Đổi số buổi HÀNG LOẠT trong 1 giao dịch atomic ở server — HOẶC đổi đủ
   *  tất cả, HOẶC không đổi gì cả nếu có lỗi giữa chừng (mất mạng...). Thay
   *  hẳn cách cũ lưu tuần tự từng buổi 1 (có thể kẹt lại nửa chừng ở số tạm
   *  — sự cố thật đã gặp, xem CLAUDE.md). Tối đa 200 buổi/lần. */
  batchRenumber: (updates: Array<{ sessionId: string; newNo: number }>) =>
    api
      .post<{ data: { updated: Array<{ sessionId: string; oldNo: number | null; newNo: number }> } }>(
        '/sessions/batch-renumber', { updates },
      )
      .then((r) => r.data.data),
}
