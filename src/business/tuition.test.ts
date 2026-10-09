import { describe, it, expect } from 'vitest'
import { billingPeriodsOf, sessionsBilledOf, currentProgressOf } from './tuition'
import { emptyEntry } from './seed'
import type { AttendanceKey, Session, Student } from '@/types'

// Tính học phí sai là mất tiền thật hoặc thu sai của phụ huynh — test kỹ hơn
// bình thường, đặc biệt các mốc biên (đúng 8/12 buổi, thiếu 1 buổi...).

function sess(no: number, attendance: AttendanceKey): Session {
  return { id: `s${no}`, no, date: '2026-01-01', entry: { ...emptyEntry(), attendance } }
}

function student(count: number, attendance: AttendanceKey = 'present'): Student {
  return { id: 'st1', name: 'Test', sessions: Array.from({ length: count }, (_, i) => sess(i + 1, attendance)) }
}

describe('billingPeriodsOf', () => {
  it('perMonth=8: đúng 8 buổi → 1 kỳ, chưa đủ 8 → 0 kỳ', () => {
    expect(billingPeriodsOf(student(7), 8)).toEqual([])
    expect(billingPeriodsOf(student(8), 8)).toEqual([{ from: 0, to: 8, label: 'Buổi 1–8' }])
  })

  it('perMonth=8: 16 buổi → 2 kỳ liên tiếp KHÔNG chồng lấn', () => {
    expect(billingPeriodsOf(student(16), 8)).toEqual([
      { from: 0, to: 8, label: 'Buổi 1–8' },
      { from: 8, to: 16, label: 'Buổi 9–16' },
    ])
  })

  it('perMonth=8: 23 buổi (chưa đủ kỳ 3) → vẫn chỉ 2 kỳ đã chốt', () => {
    expect(billingPeriodsOf(student(23), 8)).toHaveLength(2)
  })

  it('perMonth khác 8 (VD 12): chốt theo khối 12 buổi, KHÔNG có mốc giữa kỳ 6 buổi', () => {
    expect(billingPeriodsOf(student(6), 12)).toEqual([])
    expect(billingPeriodsOf(student(12), 12)).toEqual([{ from: 0, to: 12, label: 'Buổi 1–12' }])
    expect(billingPeriodsOf(student(24), 12)).toEqual([
      { from: 0, to: 12, label: 'Buổi 1–12' },
      { from: 12, to: 24, label: 'Buổi 13–24' },
    ])
  })

  it('0 buổi → không có kỳ nào', () => {
    expect(billingPeriodsOf(student(0), 8)).toEqual([])
  })

  it('sessionOffset=0 (mặc định, mọi học sinh khác) → giống hệt công thức cũ', () => {
    const st = { ...student(24), sessionOffset: 0 }
    expect(billingPeriodsOf(st, 12)).toEqual([
      { from: 0, to: 12, label: 'Buổi 1–12' },
      { from: 12, to: 24, label: 'Buổi 13–24' },
    ])
  })

  it('học sinh chuyển vào giữa chừng (sessionOffset=9, perMonth=12): 3 buổi đầu trong app → kỳ 1 chốt ngay (Buổi 10–12)', () => {
    const st = { ...student(3), sessionOffset: 9 }
    expect(billingPeriodsOf(st, 12)).toEqual([{ from: 0, to: 3, label: 'Buổi 10–12' }])
  })

  it('sessionOffset=9: đủ 15 buổi trong app (= 24 buổi thật) → có thêm kỳ 2 (Buổi 13–24)', () => {
    const st = { ...student(15), sessionOffset: 9 }
    expect(billingPeriodsOf(st, 12)).toEqual([
      { from: 0, to: 3, label: 'Buổi 10–12' },
      { from: 3, to: 15, label: 'Buổi 13–24' },
    ])
  })
})

describe('currentProgressOf', () => {
  it('chưa có buổi nào trong app → null dù offset > 0', () => {
    expect(currentProgressOf({ ...student(0), sessionOffset: 9 }, 12)).toBeNull()
  })

  it('offset=9, 1 buổi trong app → tiến độ hiện đúng 10/12 (không phải 1/12)', () => {
    expect(currentProgressOf({ ...student(1), sessionOffset: 9 }, 12)).toEqual({ current: 10, total: 12 })
  })

  it('offset=9, đúng 3 buổi (vừa chốt kỳ 1) → null, không trùng với billingPeriodsOf', () => {
    expect(currentProgressOf({ ...student(3), sessionOffset: 9 }, 12)).toBeNull()
  })
})

describe('sessionsBilledOf', () => {
  it('tính buổi có mặt + muộn + nghỉ CÓ PHÉP, CHỈ không tính nghỉ KHÔNG phép', () => {
    const st: Student = {
      id: 'st1', name: 'Test',
      sessions: [
        sess(1, 'present'), sess(2, 'late'), sess(3, 'excused'), sess(4, 'absent'), sess(5, 'present'),
      ],
    }
    expect(sessionsBilledOf(st, 0, 5)).toBe(4)
  })

  it('chỉ tính trong đúng khoảng [from, to), không tính buổi ngoài khoảng', () => {
    const st = student(10, 'present')
    expect(sessionsBilledOf(st, 0, 8)).toBe(8)
    expect(sessionsBilledOf(st, 8, 10)).toBe(2)
    expect(sessionsBilledOf(st, 0, 10)).toBe(10)
  })

  it('toàn bộ nghỉ → 0 buổi tính phí', () => {
    const st = student(8, 'absent')
    expect(sessionsBilledOf(st, 0, 8)).toBe(0)
  })
})
