import { describe, it, expect } from 'vitest'
import { billingPeriodsOf, sessionsBilledOf, currentProgressOf, periodPositionOf, sessionLabelOf, unbilledSessionsOf, duePeriodsOf, effectiveRateOf, studentTuitionNote, duplicateDatesIn } from './tuition'
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

describe('duePeriodsOf (kỳ đến hạn gửi phiếu — nhận ra kỳ đã gửi bằng BUỔI THẬT)', () => {
  const oid = (n: number) => n.toString(16).padStart(24, '0')
  const mk = (count: number, billedUpTo = 0, start = 1): Session[] =>
    Array.from({ length: count }, (_, i) => ({ id: oid(start + i), no: start + i, date: '2026-10-01', entry: { ...emptyEntry(), attendance: 'present' }, ...(i < billedUpTo ? { billed: true } : {}) }))
  const ids = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => oid(from + i + 1))

  it('chưa có phiếu nào, đủ 8 buổi → đến hạn kỳ 1, lưu vị trí 0–8', () => {
    expect(duePeriodsOf({ sessions: mk(8) }, 8, [])).toEqual([
      { from: 0, to: 8, label: 'Buổi 1–8', sessionIds: ids(0, 8), storeFrom: 0, storeTo: 8, unsynced: 0 },
    ])
  })

  it('LỖI A: đã gửi kỳ 1 (8 buổi mang dấu đã thu) + đủ 8 buổi mới → kỳ 2 PHẢI đến hạn, lưu 8–16 (không trùng phiếu 0–8)', () => {
    const due = duePeriodsOf({ sessions: mk(16, 8) }, 8, [{ periodFrom: 0, periodTo: 8 }])
    expect(due).toHaveLength(1)
    expect(due[0]).toMatchObject({ from: 0, to: 8, storeFrom: 8, storeTo: 16, sessionIds: ids(8, 16) })
  })

  it('lớp 12 buổi (Lớp 7): phiếu 0–12 đã gửi + đủ 12 buổi mới → kỳ 2 lưu 12–24', () => {
    const due = duePeriodsOf({ sessions: mk(24, 12) }, 12, [{ periodFrom: 0, periodTo: 12 }])
    expect(due.map((d) => [d.storeFrom, d.storeTo])).toEqual([[12, 24]])
  })

  it('đã gửi kỳ 1, mới có 7 buổi mới → chưa đến hạn', () => {
    expect(duePeriodsOf({ sessions: mk(15, 8) }, 8, [{ periodFrom: 0, periodTo: 8 }])).toEqual([])
  })

  it('phiếu kiểu CŨ (không buổi nào mang dấu đã thu): giữ cách so vị trí — 10 buổi, phiếu 0–8 → chưa có kỳ đến hạn', () => {
    expect(duePeriodsOf({ sessions: mk(10) }, 8, [{ periodFrom: 0, periodTo: 8 }])).toEqual([])
  })

  it('phiếu kiểu CŨ + đủ 16 buổi → kỳ 2 (vị trí 8–16) đến hạn, KHÔNG gửi lại kỳ 1', () => {
    const due = duePeriodsOf({ sessions: mk(16) }, 8, [{ periodFrom: 0, periodTo: 8 }])
    expect(due).toEqual([{ from: 8, to: 16, label: 'Tháng 2 (Buổi 1–8)', sessionIds: ids(8, 16), storeFrom: 8, storeTo: 16, unsynced: 0 }])
  })

  it('LỖI B: phiếu có danh sách buổi nhưng 1 buổi bị thiếu dấu đã thu → KHÔNG đưa buổi đó vào kỳ mới (chống thu trùng)', () => {
    const sessions = mk(16, 8)
    sessions[0].billed = undefined // buổi 1 mất dấu
    const notices = [{ periodFrom: 0, periodTo: 8, sessionIds: ids(0, 8) }]
    // danh sách chưa thu = buổi 1 + 8 buổi mới → kỳ đầu chứa buổi 1 (đã nằm trong phiếu) → bỏ qua
    expect(duePeriodsOf({ sessions }, 8, notices)).toEqual([])
  })

  it('kỳ có buổi CHƯA lên server → báo số buổi để chặn gửi', () => {
    const sessions = mk(8)
    sessions[3] = { ...sessions[3], id: 'tmp-abc' }
    expect(duePeriodsOf({ sessions }, 8, [])[0].unsynced).toBe(1)
  })

  it('học sinh chuyển vào giữa chừng (sessionOffset=3): kỳ đầu chỉ 5 buổi, kỳ sau cộng dồn đúng', () => {
    expect(duePeriodsOf({ sessions: mk(5), sessionOffset: 3 }, 8, [])[0]).toMatchObject({ from: 0, to: 5, storeFrom: 0, storeTo: 5 })
    const due2 = duePeriodsOf({ sessions: mk(13, 5), sessionOffset: 3 }, 8, [{ periodFrom: 0, periodTo: 5, sessionIds: ids(0, 5) }])
    expect(due2).toHaveLength(1)
    expect(due2[0]).toMatchObject({ storeFrom: 5, storeTo: 13 })
  })
})
describe('effectiveRateOf / studentTuitionNote (học phí riêng từng học sinh)', () => {
  const rule = (mode: 'rate' | 'percent', value: number) => ({ studentId: 's', mode, value, reason: 'anh em ruột' })
  it('không có học phí riêng → giá lớp, không ghi chú', () => {
    expect(effectiveRateOf(75000, null)).toBe(75000)
    expect(studentTuitionNote(75000, null)).toBe('')
  })
  it('giá riêng/buổi', () => {
    expect(effectiveRateOf(75000, rule('rate', 70000))).toBe(70000)
    expect(studentTuitionNote(75000, rule('rate', 70000))).toBe('Giá riêng 70.000đ/buổi (giá lớp 75.000đ) — anh em ruột')
  })
  it('giảm/tăng % — làm tròn tới đồng, khớp đúng công thức server', () => {
    expect(effectiveRateOf(75000, rule('percent', -10))).toBe(67500)
    expect(effectiveRateOf(75000, rule('percent', 12.5))).toBe(84375)
    expect(effectiveRateOf(70001, rule('percent', -33.33))).toBe(46670)
    expect(effectiveRateOf(75000, rule('percent', -100))).toBe(0)
    expect(studentTuitionNote(75000, rule('percent', -10))).toBe('Giảm 10% (75.000đ → 67.500đ/buổi) — anh em ruột')
    expect(studentTuitionNote(75000, rule('percent', 5))).toBe('Tăng 5% (75.000đ → 78.750đ/buổi) — anh em ruột')
  })
})
describe('duplicateDatesIn (chặn thu tiền dư khi kỳ có 2 buổi cùng ngày)', () => {
  it('không trùng → rỗng', () => {
    expect(duplicateDatesIn([{ date: '2026-10-02' }, { date: '2026-10-07' }])).toEqual([])
  })
  it('Lớp 2 Bảo Ngọc: 2 buổi 14/10 → báo đúng ngày', () => {
    expect(duplicateDatesIn([{ date: '2026-10-02' }, { date: '2026-10-14' }, { date: '2026-10-14' }, { date: '2026-10-16' }])).toEqual(['2026-10-14'])
  })
  it('nhiều ngày trùng → liệt kê đủ, theo thứ tự', () => {
    expect(duplicateDatesIn([{ date: '2026-10-14' }, { date: '2026-09-26' }, { date: '2026-10-14' }, { date: '2026-09-26' }])).toEqual(['2026-09-26', '2026-10-14'])
  })
})