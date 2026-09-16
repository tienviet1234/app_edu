import { describe, it, expect } from 'vitest'
import { compScore, compHasData, sessionScore, rescaleComp, detectMissingComps } from './scoring'
import { emptyEntry } from './seed'
import type { ClassData, RubricComponent, RubricDef, Session, SessionEntry } from '@/types'

// Tính điểm là phần lõi quan trọng nhất của toàn hệ thống — 1 lỗi ở đây làm
// sai điểm thật của học sinh mà không ai để ý, khác với lỗi UI dễ thấy ngay.

const entry = (patch: Partial<SessionEntry> = {}): SessionEntry => ({ ...emptyEntry(), ...patch })

const session = (no: number, entryPatch: Partial<SessionEntry> = {}): Session => ({
  id: `s${no}`, no, date: '2026-01-01', entry: entry(entryPatch),
})

describe('compScore', () => {
  it('score: đọc trực tiếp từ scores[key], "" hoặc thiếu = 0', () => {
    const comp: RubricComponent = { key: 'mini', label: 'Mini Test', max: 40, type: 'score' }
    expect(compScore(comp, entry({ scores: { mini: 35 } }))).toBe(35)
    expect(compScore(comp, entry({ scores: { mini: '' } }))).toBe(0)
    expect(compScore(comp, entry())).toBe(0)
  })

  it('ticks: cộng pts của các item đã tick, bỏ qua item không tick', () => {
    const comp: RubricComponent = {
      key: 'hw', label: 'BTVN', max: 20, type: 'ticks',
      items: [{ id: 'a', label: 'A', pts: 10 }, { id: 'b', label: 'B', pts: 10 }],
    }
    expect(compScore(comp, entry({ ticks: { hw: ['a'] } }))).toBe(10)
    expect(compScore(comp, entry({ ticks: { hw: ['a', 'b'] } }))).toBe(20)
    expect(compScore(comp, entry())).toBe(0)
  })

  it('choice: điểm của mức đã chọn, chưa chọn = 0', () => {
    const comp: RubricComponent = {
      key: 'hw', label: 'BTVN', max: 30, type: 'choice',
      options: [{ id: 'full', label: 'Hoàn thành', pts: 30 }, { id: 'none', label: 'Chưa làm', pts: 0 }],
    }
    expect(compScore(comp, entry({ choice: { hw: 'full' } }))).toBe(30)
    expect(compScore(comp, entry({ choice: { hw: 'none' } }))).toBe(0)
    expect(compScore(comp, entry())).toBe(0)
  })

  it('parts: cộng từng phần, giới hạn trong [0, max], 0 nếu skip', () => {
    const comp: RubricComponent = {
      key: 'video', label: 'Video', max: 30, type: 'parts',
      parts: [{ id: 'full', label: 'Đầy đủ', max: 10 }, { id: 'pron', label: 'Phát âm', max: 10 }, { id: 'ontime', label: 'Đúng hạn', max: 10 }],
      zeroLabel: 'Không nộp',
    }
    expect(compScore(comp, entry({ parts: { video: { full: 10, pron: 5, ontime: 0 } } }))).toBe(15)
    // Vượt quá max của phần → giới hạn lại, không cộng vượt
    expect(compScore(comp, entry({ parts: { video: { full: 99 } } }))).toBe(10)
    // Bị đánh dấu "không nộp" → luôn 0 dù parts có dữ liệu
    expect(compScore(comp, entry({ skip: { video: true }, parts: { video: { full: 10 } } }))).toBe(0)
  })
})

describe('compHasData', () => {
  const scoreComp: RubricComponent = { key: 'mini', label: 'Mini', max: 40, type: 'score' }
  it('score: rỗng/thiếu = chưa nhập, có giá trị (kể cả 0) = đã nhập', () => {
    expect(compHasData(scoreComp, entry())).toBe(false)
    expect(compHasData(scoreComp, entry({ scores: { mini: '' } }))).toBe(false)
    expect(compHasData(scoreComp, entry({ scores: { mini: 0 } }))).toBe(true)
  })
})

describe('sessionScore', () => {
  // Rubric giả lập giống thật: attendance(10) + mini(40) + hw(50) = 100, khớp
  // đúng cách rubric thật luôn thiết kế tổng = 100 khi MỌI tiêu chí đều có dữ liệu.
  const r: Pick<RubricDef, 'comps' | 'attendance'> = {
    comps: [
      { key: 'mini', label: 'Mini', max: 40, type: 'score' },
      { key: 'hw', label: 'BTVN', max: 50, type: 'score' },
    ],
    attendance: { mode: 'avg' },
  }
  const rSingle: Pick<RubricDef, 'comps' | 'attendance'> = {
    comps: [{ key: 'mini', label: 'Mini', max: 40, type: 'score' }],
    attendance: { mode: 'avg' },
  }

  it('nghỉ có phép (excused) → null, không tính vào điểm trung bình', () => {
    expect(sessionScore(entry({ attendance: 'excused' }), r)).toBeNull()
  })

  it('nghỉ không phép (absent) → 0 tuyệt đối dù comps có dữ liệu', () => {
    expect(sessionScore(entry({ attendance: 'absent', scores: { mini: 40 } }), r)).toBe(0)
  })

  it('chưa nhập tiêu chí nào (chỉ điểm danh) → null, không phải 0', () => {
    expect(sessionScore(entry({ attendance: 'present' }), r)).toBeNull()
  })

  it('có mặt + đã chấm ĐỦ mọi tiêu chí → giống hệt cách tính cũ (tổng thô, vì mẫu số vừa đúng 100)', () => {
    expect(sessionScore(entry({ attendance: 'present', scores: { mini: 35, hw: 50 } }), r)).toBe(95)
  })

  it('hôm đó KHÔNG có 1 tiêu chí (VD không có BTVN) → không bị tính là 0đ kéo điểm xuống, tự quy đổi lại thang 100 theo phần đã chấm', () => {
    // Chỉ chấm Mini (35/40), không đụng tới BTVN (giả sử hôm đó không có bài tập).
    // Trước fix: 10 + 35 + 0 = 45/100 → tưởng học sinh học kém, cảnh báo oan.
    // Sau fix: chỉ quy đổi trên phần ĐÃ chấm — (10+35)/(10+40) = 45/50 = 90%.
    expect(sessionScore(entry({ attendance: 'present', scores: { mini: 35 } }), r)).toBe(90)
  })

  it('rubric chỉ có 1 tiêu chí (mẫu số tự nhiên khác 100) vẫn quy đổi đúng thang 100', () => {
    expect(sessionScore(entry({ attendance: 'present', scores: { mini: 35 } }), rSingle)).toBe(90)
  })

  it('không có session (chưa tạo buổi) → null', () => {
    expect(sessionScore(undefined, r)).toBeNull()
  })
})

describe('detectMissingComps — phân biệt "quên chấm" và "hôm đó không có mục này"', () => {
  const comps: RubricComponent[] = [
    { key: 'mini', label: 'Mini Test', max: 40, type: 'score' },
    { key: 'hw', label: 'BTVN', max: 50, type: 'score' },
  ]

  function makeClass(students: Array<{ id: string; sessions: Session[] }>): ClassData {
    return {
      id: 'c1', name: 'Lớp Test', teacher: 'Cô A', level: 'secondary', perMonth: 12,
      students: students.map((s) => ({ id: s.id, name: s.id, sessions: s.sessions })),
      comments: {},
    }
  }

  it('cả lớp đều thiếu cùng 1 mục (hôm đó thật sự không có) → không báo gì', () => {
    const cls = makeClass([
      { id: 'a', sessions: [session(1, { attendance: 'present', scores: { mini: 30 } })] },
      { id: 'b', sessions: [session(1, { attendance: 'present', scores: { mini: 25 } })] },
    ])
    expect(detectMissingComps(cls, 1, 'a', comps)).toEqual([])
  })

  it('có bạn khác đã chấm mục này, mình thì chưa → báo thiếu (khả năng quên chấm)', () => {
    const cls = makeClass([
      { id: 'a', sessions: [session(1, { attendance: 'present', scores: { mini: 30 } })] }, // thiếu hw
      { id: 'b', sessions: [session(1, { attendance: 'present', scores: { mini: 25, hw: 40 } })] }, // có đủ
    ])
    const flags = detectMissingComps(cls, 1, 'a', comps)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ compKey: 'hw', peersWithData: 1, totalPeers: 1 })
  })

  it('học sinh nghỉ học → không báo gì (không có gì để chấm)', () => {
    const cls = makeClass([
      { id: 'a', sessions: [session(1, { attendance: 'absent' })] },
      { id: 'b', sessions: [session(1, { attendance: 'present', scores: { mini: 25, hw: 40 } })] },
    ])
    expect(detectMissingComps(cls, 1, 'a', comps)).toEqual([])
  })

  it('bạn khác nghỉ học thì không tính vào "peersWithData/totalPeers"', () => {
    const cls = makeClass([
      { id: 'a', sessions: [session(1, { attendance: 'present', scores: { mini: 30 } })] },
      { id: 'b', sessions: [session(1, { attendance: 'absent' })] },
      { id: 'c', sessions: [session(1, { attendance: 'present', scores: { mini: 20, hw: 40 } })] },
    ])
    const flags = detectMissingComps(cls, 1, 'a', comps)
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ compKey: 'hw', peersWithData: 1, totalPeers: 1 }) // chỉ tính c, bỏ qua b
  })

  it('học sinh chưa có buổi này → không báo gì', () => {
    const cls = makeClass([{ id: 'a', sessions: [] }])
    expect(detectMissingComps(cls, 1, 'a', comps)).toEqual([])
  })

  it('học sinh CHƯA được chấm mục nào cả (mới mở lên, còn mặc định) → không báo, dù bạn khác đã có dữ liệu', () => {
    // Giáo viên chỉ đang lần lượt chấm từng em — em chưa tới lượt không phải
    // "quên chấm", chỉ là chưa bắt đầu. Đây là bug thật đã xảy ra: học sinh
    // hoàn toàn trống (chỉ có attendance mặc định 'present') vẫn bị báo
    // "quên chấm Thái độ học tập" chỉ vì 1 bạn khác trong lớp đã có điểm.
    const cls = makeClass([
      { id: 'a', sessions: [session(1)] }, // hoàn toàn trống, chưa chấm gì
      { id: 'b', sessions: [session(1, { attendance: 'present', scores: { mini: 25, hw: 40 } })] },
    ])
    expect(detectMissingComps(cls, 1, 'a', comps)).toEqual([])
  })
})

describe('rescaleComp — đổi "Số câu" (newMax), tự chia lại điểm phần nhỏ', () => {
  it('ticks: tổng các phần sau khi chia lại phải khớp CHÍNH XÁC newMax', () => {
    const comp: RubricComponent = {
      key: 'hw', label: 'BTVN', max: 20, type: 'ticks',
      items: [{ id: 'a', label: 'A', pts: 10 }, { id: 'b', label: 'B', pts: 10 }],
    }
    const next = rescaleComp(comp, 13)
    expect(next.max).toBe(13)
    const sum = (next.items ?? []).reduce((a, it) => a + it.pts, 0)
    expect(sum).toBe(13) // không được lệch do làm tròn từng phần riêng lẻ
  })

  it('parts: tổng max các phần sau khi chia lại phải khớp CHÍNH XÁC newMax', () => {
    const comp: RubricComponent = {
      key: 'video', label: 'Video', max: 30, type: 'parts',
      parts: [{ id: 'a', label: 'A', max: 10 }, { id: 'b', label: 'B', max: 10 }, { id: 'c', label: 'C', max: 10 }],
    }
    const next = rescaleComp(comp, 20)
    expect(next.max).toBe(20)
    const sum = (next.parts ?? []).reduce((a, p) => a + p.max, 0)
    expect(sum).toBe(20)
  })

  it('choice: chia theo tỉ lệ mức cao nhất cũ, KHÔNG dùng distribute (mức không phải tổng cộng dồn)', () => {
    // Bug đã sửa trong session trước: "Bài tập về nhà" hiện sai "30/15" vì
    // rescaleComp không xử lý nhánh choice, để nguyên option.pts cũ không đổi
    // theo max mới — dẫn đến tổng cộng các option vẫn còn 20 dù max đã là 15.
    const comp: RubricComponent = {
      key: 'hw', label: 'BTVN', max: 30, type: 'choice',
      options: [
        { id: 'full', label: 'Hoàn thành', pts: 30 },
        { id: 'partial', label: 'Một phần', pts: 15 },
        { id: 'none', label: 'Chưa làm', pts: 0 },
      ],
    }
    const next = rescaleComp(comp, 15)
    expect(next.max).toBe(15)
    expect(next.options?.find((o) => o.id === 'full')?.pts).toBe(15)
    expect(next.options?.find((o) => o.id === 'partial')?.pts).toBe(8) // round(15*15/30) = 8 (largest fraction rounds up)
    expect(next.options?.find((o) => o.id === 'none')?.pts).toBe(0)
  })
})
