import { describe, it, expect } from 'vitest'
import { compScore, compHasData, sessionScore, rescaleComp } from './scoring'
import { emptyEntry } from './seed'
import type { RubricComponent, RubricDef, SessionEntry } from '@/types'

// Tính điểm là phần lõi quan trọng nhất của toàn hệ thống — 1 lỗi ở đây làm
// sai điểm thật của học sinh mà không ai để ý, khác với lỗi UI dễ thấy ngay.

const entry = (patch: Partial<SessionEntry> = {}): SessionEntry => ({ ...emptyEntry(), ...patch })

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
  const r: Pick<RubricDef, 'comps' | 'attendance'> = {
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

  it('có mặt + đã chấm → điểm chuyên cần (10) + tổng các tiêu chí', () => {
    expect(sessionScore(entry({ attendance: 'present', scores: { mini: 35 } }), r)).toBe(45)
  })

  it('không có session (chưa tạo buổi) → null', () => {
    expect(sessionScore(undefined, r)).toBeNull()
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
