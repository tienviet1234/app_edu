import { describe, it, expect } from 'vitest'
import { billingPeriodsOf, sessionsBilledOf, currentProgressOf, periodPositionOf, sessionLabelOf, unbilledSessionsOf } from './tuition'
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

  it('perMonth=8: 16 buổi → 2 kỳ liên tiếp KHÔNG chồng lấn, kỳ 2 reset về Buổi 1 kèm nhãn Tháng', () => {
    expect(billingPeriodsOf(student(16), 8)).toEqual([
      { from: 0, to: 8, label: 'Buổi 1–8' },
      { from: 8, to: 16, label: 'Tháng 2 (Buổi 1–8)' },
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
      { from: 12, to: 24, label: 'Tháng 2 (Buổi 1–12)' },
    ])
  })

  it('0 buổi → không có kỳ nào', () => {
    expect(billingPeriodsOf(student(0), 8)).toEqual([])
  })

  it('sessionOffset=0 (mặc định, mọi học sinh khác) → giống hệt công thức cũ (trừ nhãn kỳ 2 giờ reset về Buổi 1)', () => {
    const st = { ...student(24), sessionOffset: 0 }
    expect(billingPeriodsOf(st, 12)).toEqual([
      { from: 0, to: 12, label: 'Buổi 1–12' },
      { from: 12, to: 24, label: 'Tháng 2 (Buổi 1–12)' },
    ])
  })

  it('học sinh chuyển vào giữa chừng (sessionOffset=9, perMonth=12): 3 buổi đầu trong app → kỳ 1 chốt ngay (Buổi 10–12, chưa reset vì vẫn đang ở kỳ 1 dang dở)', () => {
    const st = { ...student(3), sessionOffset: 9 }
    expect(billingPeriodsOf(st, 12)).toEqual([{ from: 0, to: 3, label: 'Buổi 10–12' }])
  })

  it('sessionOffset=9: đủ 15 buổi trong app (= 24 buổi thật) → kỳ 2 TỰ RESET về Buổi 1 (Tháng 2)', () => {
    const st = { ...student(15), sessionOffset: 9 }
    expect(billingPeriodsOf(st, 12)).toEqual([
      { from: 0, to: 3, label: 'Buổi 10–12' },
      { from: 3, to: 15, label: 'Tháng 2 (Buổi 1–12)' },
    ])
  })
})

describe('periodPositionOf', () => {
  it('offset=0: kỳ 1 giữ nguyên số buổi, kỳ 2 trở đi reset về 1', () => {
    expect(periodPositionOf(1, 12)).toEqual({ period: 1, displayNo: 1, blockSize: 12 })
    expect(periodPositionOf(12, 12)).toEqual({ period: 1, displayNo: 12, blockSize: 12 })
    expect(periodPositionOf(13, 12)).toEqual({ period: 2, displayNo: 1, blockSize: 12 })
    expect(periodPositionOf(24, 12)).toEqual({ period: 2, displayNo: 12, blockSize: 12 })
    expect(periodPositionOf(25, 12)).toEqual({ period: 3, displayNo: 1, blockSize: 12 })
  })

  it('perMonth=8 dùng blockSize=8', () => {
    expect(periodPositionOf(9, 8)).toEqual({ period: 2, displayNo: 1, blockSize: 8 })
  })

  it('offset=9 (Hạnh Nguyên): buổi app đầu tiên (no=1) hiện đúng Buổi 10, chưa reset', () => {
    expect(periodPositionOf(1, 12, 9)).toEqual({ period: 1, displayNo: 10, blockSize: 12 })
    expect(periodPositionOf(3, 12, 9)).toEqual({ period: 1, displayNo: 12, blockSize: 12 })
  })

  it('offset=9: buổi app thứ 4 (= buổi thật thứ 13) tự reset về Buổi 1 của kỳ 2', () => {
    expect(periodPositionOf(4, 12, 9)).toEqual({ period: 2, displayNo: 1, blockSize: 12 })
  })
})

describe('sessionLabelOf', () => {
  it('kỳ 1 → chỉ "Buổi N", không có hậu tố tháng', () => {
    expect(sessionLabelOf(5, 12)).toBe('Buổi 5')
  })

  it('kỳ 2 trở đi → có hậu tố "· T.K"', () => {
    expect(sessionLabelOf(13, 12)).toBe('Buổi 1 · T.2')
    expect(sessionLabelOf(25, 12)).toBe('Buổi 1 · T.3')
  })

  it('offset=9: buổi thật thứ 13 (buổi app thứ 4) → "Buổi 1 · T.2"', () => {
    expect(sessionLabelOf(4, 12, 9)).toBe('Buổi 1 · T.2')
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

describe('unbilledSessionsOf', () => {
  it('không có buổi nào billed → trả nguyên danh sách', () => {
    const st = student(5)
    expect(unbilledSessionsOf(st)).toEqual(st.sessions)
  })

  it('lọc đúng các buổi billed=true, giữ nguyên thứ tự các buổi còn lại', () => {
    const st: Student = {
      id: 'st1', name: 'Test',
      sessions: [
        { ...sess(1, 'present'), billed: true },
        { ...sess(2, 'present'), billed: true },
        sess(3, 'present'),
        sess(4, 'present'),
      ],
    }
    const unbilled = unbilledSessionsOf(st)
    expect(unbilled.map((s) => s.no)).toEqual([3, 4])
  })

  // Tái hiện ĐÚNG ca thật đã gặp: kỳ 1 (8 buổi) đã chốt + thu tiền, sau đó 2
  // buổi lỗi/trùng trong kỳ đó bị xóa — nếu KHÔNG đánh dấu billed cho các
  // buổi còn sót, billingPeriodsOf/currentProgressOf sẽ coi chúng là buổi
  // MỚI chưa tính tiền, hiện thành 1 khoản "chưa tới hạn" ẢO (thu tiền
  // trùng nếu admin lỡ chốt buổi). Đánh dấu billed cho các buổi còn lại
  // (dù chỉ có 6-7/8, chưa đủ để tự tạo lại 1 TuitionNotice khác) phải chặn
  // được việc này hoàn toàn.
  it('ca thật: xóa 2/8 buổi đã thu tiền, 6 buổi còn lại đều billed → không còn buổi nào bị tính lại', () => {
    const st: Student = {
      id: 'st1', name: 'Kim Ngân',
      sessions: Array.from({ length: 6 }, (_, i) => ({ ...sess(i + 1, 'present'), billed: true })),
    }
    const unbilled = unbilledSessionsOf(st)
    expect(unbilled).toEqual([])
    expect(billingPeriodsOf({ ...st, sessions: unbilled }, 8)).toEqual([])
    expect(currentProgressOf({ ...st, sessions: unbilled }, 8)).toBeNull()
  })
})
