import { api } from '@/utils/api'

export interface ApiTeacher {
  _id: string
  name: string
  email: string
}

/** Danh sách giáo viên — dùng để chọn giáo viên phụ (đồng quản lý 1 lớp) ở
 *  màn Lớp học. `GET /teachers` cho phép role=teacher gọi (không chỉ admin). */
export const teacherService = {
  list: (q?: string) =>
    api
      .get<{ data: { items: ApiTeacher[] } }>('/teachers', { params: { limit: '50', ...(q ? { q } : {}) } })
      .then((r) => r.data.data.items),
}
