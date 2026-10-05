import { describe, it, expect } from 'vitest'
import { buildComment, sessionDetailsOf } from './report'
import { statsOf } from './stats'
import { emptyEntry } from './seed'
import { getRubric } from '@/constants/rubrics'
import type { ClassData, Session, Student } from '@/types'

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

describe('sessionDetailsOf — chi tiết từng buổi (bài giao + tình hình)', () => {
  it('đánh số LẠI theo kỳ (1,2,3...), lấy đúng bài tập giao + ghi chú từng buổi', () => {
    const student: Student = {
      id: 'st1', name: 'Minh Khôi',
      sessions: [
        {
          id: 's1', no: 5, date: '2026-07-30', homework: 'Đọc sách bài tập trang 28',
          entry: { ...emptyEntry(), attendance: 'present', note: 'ĐÃ LÀM VIDEO', ev: { video: { pronErr: 'make, snowflake, snowman' } } },
        },
        {
          id: 's2', no: 6, date: '2026-08-04', homework: 'Làm sách bài tập trang 29,30',
          entry: { ...emptyEntry(), attendance: 'absent' },
        },
      ],
    }
    const rows = sessionDetailsOf(student, 0, 2)
    expect(rows).toEqual([
      { no: 1, date: '2026-07-30', homework: 'Đọc sách bài tập trang 28', status: 'ĐÃ LÀM VIDEO; make, snowflake, snowman', isAuto: false },
      { no: 2, date: '2026-08-04', homework: 'Làm sách bài tập trang 29,30', status: 'Nghỉ không phép', isAuto: false },
    ])
  })

  it('chỉ lấy đúng khoảng [from, to), không lấy buổi ngoài kỳ', () => {
    const student: Student = {
      id: 'st1', name: 'Test',
      sessions: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`, no: i + 1, date: '2026-01-01', homework: `HW${i + 1}`,
        entry: { ...emptyEntry(), attendance: 'present' as const },
      })),
    }
    const rows = sessionDetailsOf(student, 8, 10)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ no: 1, homework: 'HW9' })
    expect(rows[1]).toMatchObject({ no: 2, homework: 'HW10' })
  })

  it('buổi không có ghi chú gì — tự sinh nhận xét từ điểm số thật (đã chấm), đánh dấu isAuto', () => {
    const r = getRubric('secondary')
    const student: Student = {
      id: 'st1', name: 'Minh Khôi',
      sessions: [{
        id: 's1', no: 1, date: '2026-01-01',
        // Chỉ tích 3/4 việc của "Bài tập về nhà" (ticks), không ghi note/ev
        // gì khác — không có cách nào giáo viên đã "ghi chú" buổi này.
        entry: { ...emptyEntry(), attendance: 'present', ticks: { hw: ['h_full', 'h_correct', 'h_ontime'] } },
      }],
    }
    const rows = sessionDetailsOf(student, 0, 1, r)
    expect(rows[0].isAuto).toBe(true)
    // Phải nêu đúng tên việc ĐÃ làm và việc CHƯA làm theo đúng tick thật — không bịa.
    expect(rows[0].status).toContain('hoàn thành đầy đủ')
    expect(rows[0].status).toContain('làm đúng yêu cầu')
    expect(rows[0].status).toContain('nộp đúng hạn')
    expect(rows[0].status).toContain('chưa đạt: viết sạch đẹp')
  })

  it('buổi ĐÃ có ghi chú thật của giáo viên — không đụng vào, dù có truyền rubric', () => {
    const r = getRubric('secondary')
    const student: Student = {
      id: 'st1', name: 'Minh Khôi',
      sessions: [{
        id: 's1', no: 1, date: '2026-01-01',
        entry: {
          ...emptyEntry(), attendance: 'present', note: 'Hôm nay con học tốt',
          ticks: { hw: ['h_full'] }, // có điểm số nhưng KHÔNG được dùng để ghi đè note thật
        },
      }],
    }
    const rows = sessionDetailsOf(student, 0, 1, r)
    expect(rows[0].status).toBe('Hôm nay con học tốt')
    expect(rows[0].isAuto).toBe(false)
  })
})
