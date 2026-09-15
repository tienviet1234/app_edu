import { api } from '@/utils/api'

/** Giáo viên sửa tên hiển thị/avatar học sinh trong lớp mình dạy — chỉ
 *  hoạt động khi học sinh đã có tài khoản thật trên server (isMongoid). */
export const studentService = {
  update: (id: string, patch: { name?: string; avatar?: string }) =>
    api.patch(`/students/${id}`, patch).then((r) => r.data.data),
}
