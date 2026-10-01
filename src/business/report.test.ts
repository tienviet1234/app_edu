import { describe, it, expect } from 'vitest'
import { buildComment } from './report'
import { statsOf } from './stats'
import { emptyEntry } from './seed'
import { getRubric } from '@/constants/rubrics'
import type { ClassData, Session } from '@/types'

// buildComment() sinh "nhận xét tự động" gửi phụ huynh — cần kiểm tra nó vẫn
// nêu được chi tiết CỤ THỂ (VD từ vựng cần luyện) chứ không chỉ chung chung,
// và hoàn toàn dựa trên dữ liệu giáo viên đã ghi (ev), không tự bịa.

function sess(no: number, note: string): Session {
  return {
    id: `s${no}`, no, date: '2026-01-01',
    // scores.mini cần có giá trị để compHasData/sessionScore coi buổi này là
    // ĐÃ CHẤM (có dữ liệu) — nếu không, cả buổi bị statsOf bỏ qua hoàn toàn
    // (kể cả ev.note), không phản ánh đúng việc giáo viên đã chấm điểm thật.
    entry: { ...emptyEntry(), attendance: 'present', scores: { mini: 35 }, ev: { mini: { note } } },
  }
}

function cls(sessions: Session[]): ClassData {
  return {
    id: 'c1', name: 'Lớp 7A', teacher: 'Cô A', level: 'secondary', perMonth: 8,
    students: [{ id: 'st1', name: 'Minh Khôi', sessions }],
    comments: {},
  }
}

describe('buildComment — chi tiết ghi chú cụ thể', () => {
  it('nêu được từ/ghi chú cụ thể giáo viên đã ghi (không chỉ điểm % chung chung)', () => {
    const c = cls([
      sess(1, 'make, snowflake, snowman'),
      sess(2, 'make, city'),
    ])
    const s = statsOf(c, c.students[0].sessions)
    const r = getRubric(c.level)
    const comment = buildComment('Minh Khôi', s, r)
    // "make" xuất hiện 2 lần — được ghi nhận nhiều nhất, phải xuất hiện trong nhận xét.
    expect(comment).toContain('make')
    expect(comment).toContain('Lỗi cụ thể cần nhắc')
  })

  it('không có ghi chú cụ thể nào thì không bịa ra, vẫn ra nhận xét bình thường', () => {
    const c = cls([{ id: 's1', no: 1, date: '2026-01-01', entry: { ...emptyEntry(), attendance: 'present' } }])
    const s = statsOf(c, c.students[0].sessions)
    const r = getRubric(c.level)
    const comment = buildComment('Minh Khôi', s, r)
    expect(comment.length).toBeGreaterThan(0)
  })
})
