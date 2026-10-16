import type { FilterQuery, Types } from 'mongoose'
import type { IClass } from '../models/Class.js'

/**
 * 1 lớp có thể có 2 giáo viên cùng quản lý — giáo viên CHÍNH (`teacherId`) và
 * giáo viên PHỤ (`assistantTeacherIds`), quyền ngang nhau hoàn toàn (xem yêu
 * cầu người dùng — lớp thật có 2 cô cùng dạy 1 lớp). MỌI chỗ kiểm tra "đây có
 * phải lớp của giáo viên này không" phải dùng 2 hàm dưới đây, không tự so
 * sánh thẳng `cls.teacherId` — thiếu `assistantTeacherIds` thì giáo viên phụ
 * bị coi như không liên quan gì tới lớp, không thấy lớp/dữ liệu của chính
 * mình đang dạy.
 */

type TeacherScopedClass = Pick<IClass, 'teacherId' | 'assistantTeacherIds'>

export function isClassTeacher(cls: TeacherScopedClass | null | undefined, userId: string | Types.ObjectId): boolean {
  if (!cls) return false
  const uid = String(userId)
  if (cls.teacherId && String(cls.teacherId) === uid) return true
  return !!cls.assistantTeacherIds?.some((id) => String(id) === uid)
}

/** Dùng trong filter Mongo để lấy "các lớp giáo viên này được quyền thấy" —
 *  VD `Class.find(teacherScopeFilter(userId))`. */
export function teacherScopeFilter(userId: string): FilterQuery<TeacherScopedClass> {
  return { $or: [{ teacherId: userId }, { assistantTeacherIds: userId }] }
}
