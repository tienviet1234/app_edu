import type { ClassData } from '@/types'

/** Bỏ dấu tiếng Việt, chữ thường, gộp khoảng trắng — để so tên đọc được từ
 *  ảnh (có thể thiếu/lệch dấu do OCR) với tên đã lưu trong hệ thống. */
export function normalizeViName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

export interface StudentMatch {
  classId: string
  classIndex: number
  className: string
  studentId: string
  studentName: string
}

/** Tìm học sinh khớp tên trong TOÀN BỘ danh sách lớp đang có trên máy —
 *  không cần biết trước là lớp nào, đúng như cách giáo viên quét cả xấp bài
 *  nhiều lớp cùng lúc. Khớp tuyệt đối (không dấu) trước; nếu không có mới hạ
 *  xuống khớp gần đúng (tên đọc được là 1 phần của tên lưu, hoặc ngược lại)
 *  để chịu được OCR đọc thiếu/thừa vài chữ.
 *  `restrictToClassId` (không bắt buộc): nếu giáo viên đã biết chắc cả xấp
 *  ảnh đang chấm là CÙNG 1 LỚP, chỉ tìm trong đúng lớp đó — giảm hẳn rủi ro
 *  trùng tên giữa các lớp khác nhau. Vẫn duyệt qua TOÀN BỘ mảng `classes`
 *  (chỉ bỏ qua lớp không khớp) để `classIndex` trả về luôn đúng vị trí thật
 *  trong `classes`, không lệch do lọc mảng trước khi gọi hàm. */
export function matchStudentsByName(
  classes: ClassData[], rawName: string, restrictToClassId?: string,
): StudentMatch[] {
  const q = normalizeViName(rawName)
  if (!q) return []

  const all: StudentMatch[] = []
  classes.forEach((c, classIndex) => {
    if (restrictToClassId && c.id !== restrictToClassId) return
    c.students.forEach((s) => {
      all.push({ classId: c.id, classIndex, className: c.name, studentId: s.id, studentName: s.name })
    })
  })

  const exact = all.filter((m) => normalizeViName(m.studentName) === q)
  if (exact.length) return exact

  const partial = all.filter((m) => {
    const n = normalizeViName(m.studentName)
    return n.includes(q) || q.includes(n)
  })
  return partial
}
