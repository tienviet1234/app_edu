import { describe, it, expect } from 'vitest'
import { normalizeViName, matchStudentsByName } from './aiMatch'
import type { ClassData } from '@/types'

function cls(id: string, name: string, students: string[]): ClassData {
  return {
    id, name, teacher: '', level: 'secondary', perMonth: 8,
    students: students.map((n, i) => ({ id: `${id}-s${i}`, name: n, sessions: [] })),
    comments: {},
  }
}

describe('normalizeViName', () => {
  it('bỏ dấu, chữ thường, gộp khoảng trắng', () => {
    expect(normalizeViName('Nguyễn   Minh Anh')).toBe('nguyen minh anh')
    expect(normalizeViName('Đỗ Quang Minh')).toBe('do quang minh')
  })
})

describe('matchStudentsByName', () => {
  const classes = [
    cls('c1', 'Lớp 8A', ['Nguyễn Minh Anh', 'Trần Bảo Ngọc']),
    cls('c2', 'Lớp 9', ['Lê Gia Huy', 'Nguyễn Minh Ánh']),
  ]

  it('khớp tuyệt đối trả về đúng 1 kết quả nếu tên không trùng', () => {
    const m = matchStudentsByName(classes, 'Lê Gia Huy')
    expect(m).toHaveLength(1)
    expect(m[0].className).toBe('Lớp 9')
  })

  it('tên đọc thiếu dấu vẫn khớp tuyệt đối (so theo bản không dấu)', () => {
    const m = matchStudentsByName(classes, 'nguyen minh anh')
    expect(m.map((x) => x.studentName)).toContain('Nguyễn Minh Anh')
  })

  it('không tìm thấy trả về mảng rỗng', () => {
    expect(matchStudentsByName(classes, 'Không Ai Cả')).toEqual([])
  })

  it('tên rỗng trả về mảng rỗng', () => {
    expect(matchStudentsByName(classes, '')).toEqual([])
  })
})
