import { describe, it, expect } from 'vitest'
import { sortSessionsByDate, sequentialNumbering, numberingProblemOf, lessonNoFromLabel, renumberAfterRemoval, removeSessionLocally, insertNoByDate } from './resequence'
import { numberingProblem as serverNumberingProblem, planRemoveFromNumbering as serverPlanRemove, planInsertSession as serverPlanInsert } from '../../server/src/utils/dataRules'

interface S { id: string; date: string; no: number }

describe('sortSessionsByDate', () => {
  it('sắp đúng theo ngày tăng dần', () => {
    const sessions: S[] = [
      { id: 'c', date: '2026-09-17', no: 3 },
      { id: 'a', date: '2026-09-12', no: 1 },
      { id: 'b', date: '2026-09-15', no: 2 },
    ]
    expect(sortSessionsByDate(sessions).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('cùng ngày thì giữ ổn định theo no hiện tại', () => {
    const sessions: S[] = [
      { id: 'y', date: '2026-10-08', no: 16 },
      { id: 'x', date: '2026-10-08', no: 15 },
    ]
    expect(sortSessionsByDate(sessions).map((s) => s.id)).toEqual(['x', 'y'])
  })
})

describe('sequentialNumbering', () => {
  it('danh sách đã đúng thứ tự thì giữ nguyên số (1..N liên tục)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-12', no: 1 },
      { id: 'b', date: '2026-09-15', no: 2 },
      { id: 'c', date: '2026-09-17', no: 3 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('xếp lại đúng khi số buổi bị xáo trộn (kịch bản thật — Lớp 7, Vương Thắng)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-15', no: 4 },
      { id: 'b', date: '2026-09-19', no: 3 },
      { id: 'c', date: '2026-09-22', no: 7 },
      { id: 'd', date: '2026-09-24', no: 5 },
      { id: 'e', date: '2026-09-26', no: 6 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 })
  })

  it('đóng khoảng trống khi 1 buổi ở giữa bị xóa (không bỏ số, VD 7 rồi nhảy 9)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-01', no: 7 },
      { id: 'b', date: '2026-09-03', no: 9 },
      { id: 'c', date: '2026-09-05', no: 10 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('gỡ số TẠM bị kẹt (dải +1000 từ applySafely lỗi mạng giữa chừng)', () => {
    const sessions: S[] = [
      { id: 'a', date: '2026-09-12', no: 1014 },
      { id: 'b', date: '2026-09-15', no: 4 },
      { id: 'c', date: '2026-09-17', no: 5 },
    ]
    expect(sequentialNumbering(sessions)).toEqual({ a: 1, b: 2, c: 3 })
  })

  it('mảng rỗng trả về object rỗng', () => {
    expect(sequentialNumbering([])).toEqual({})
  })

  it('1 buổi duy nhất luôn thành Buổi 1', () => {
    expect(sequentialNumbering([{ id: 'a', date: '2026-09-12', no: 99 }])).toEqual({ a: 1 })
  })
})

describe('Số buổi 1..n (10/11) — máy kiểm tra Y HỆT server', () => {
  it('numberingProblemOf: đúng 1..n → null; trống / trùng / vượt → nêu nhãn dễ đọc', () => {
    expect(numberingProblemOf([2, 1, 3], 8)).toBeNull()
    expect(numberingProblemOf([1, 2, 3, 4, 5, 6, 7, 9], 8)).toContain('thiếu Tháng 1 · Buổi 8/8')
    expect(numberingProblemOf([1, 2, 2], 12)).toContain('2 buổi cùng số Tháng 1 · Buổi 2/12')
    expect(numberingProblemOf([...Array.from({ length: 13 }, (_, i) => i + 1), 15], 12)).toContain('vượt quá: Tháng 2 · Buổi 3/12')
  })

  it('đối chiếu server trên 2.000 dãy ngẫu nhiên: cùng kết luận, cùng lời báo', () => {
    let r = 7
    const rnd = (n: number) => { r = (r * 1103515245 + 12345) % 2147483648; return r % n }
    for (let i = 0; i < 2000; i++) {
      const n = 1 + rnd(20)
      const nos = Array.from({ length: n }, (_, k) => (rnd(5) === 0 ? 1 + rnd(n + 3) : k + 1))
      const per = rnd(2) ? 8 : 12, off = rnd(4)
      expect(numberingProblemOf(nos, per, off)).toBe(serverNumberingProblem(nos, per, off))
    }
  })

  it('lessonNoFromLabel: "Tháng 2 · Buổi 1/8" = buổi 9; Buổi 9 ở lớp 8 buổi/tháng → từ chối', () => {
    expect(lessonNoFromLabel(2, 1, 8)).toEqual({ ok: true, no: 9 })
    expect(lessonNoFromLabel(1, 12, 12)).toEqual({ ok: true, no: 12 })
    expect(lessonNoFromLabel(2, 1, 12, 9)).toEqual({ ok: true, no: 4 })
    expect(lessonNoFromLabel(1, 9, 8)).toMatchObject({ ok: false })
    expect(lessonNoFromLabel(1, 13, 12)).toMatchObject({ ok: false })
    expect(lessonNoFromLabel(0, 1, 8)).toMatchObject({ ok: false })
    expect(lessonNoFromLabel(1, 2, 12, 5)).toMatchObject({ ok: false })
  })

  it('renumberAfterRemoval Y HỆT server: xóa giữa → các buổi sau lùi 1 số', () => {
    const ex = [{ id: 'a', no: 1 }, { id: 'b', no: 2 }, { id: 'c', no: 3 }, { id: 'd', no: 4 }]
    for (const id of ['a', 'b', 'c', 'd', 'zz']) expect(renumberAfterRemoval(ex, id)).toEqual(serverPlanRemove(ex, id))
    expect(renumberAfterRemoval(ex, 'b')).toEqual([{ id: 'c', from: 3, to: 2 }, { id: 'd', from: 4, to: 3 }])
  })
})

describe('removeSessionLocally / insertNoByDate (10/11)', () => {
  const mk = () => ({ sessions: [{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'b', no: 2, date: '2026-10-03' }, { id: 'c', no: 3, date: '2026-10-08' }] as never[] as Array<{ id: string; no: number; date: string; homework: string; entry: never }> })
  it('xóa buổi đã lên server → buổi sau lùi số; buổi chỉ trên máy → không lùi', () => {
    const a = mk(); removeSessionLocally(a as never, 'b', true)
    expect(a.sessions.map((s) => [s.id, s.no])).toEqual([['a', 1], ['c', 2]])
    const b = mk(); removeSessionLocally(b as never, 'b', false)
    expect(b.sessions.map((s) => [s.id, s.no])).toEqual([['a', 1], ['c', 3]])
  })
  it('insertNoByDate Y HỆT server tạo theo ngày (giữa, đầu, cuối, cùng ngày đã có thì server từ chối riêng)', () => {
    const ex = [{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'b', no: 2, date: '2026-10-03' }, { id: 'c', no: 3, date: '2026-10-08' }]
    for (const d of ['2026-09-20', '2026-10-02', '2026-10-05', '2026-10-30']) {
      const sv = serverPlanInsert(ex, { date: d }, 8)
      expect(sv.ok && sv.newNo).toBe(insertNoByDate(ex, d))
    }
    expect(insertNoByDate([], '2026-10-01')).toBe(1)
  })
})
