import { describe, it, expect } from 'vitest'
import { levelChangeConfirm, offsetChangeConfirm, removeStudentConfirm } from './classActions'

describe('classActions — hỏi lại ở màn Lớp học (11/11)', () => {
  it('đổi cấp lớp nêu số buổi/kỳ mới + học phí tính lại', () => {
    expect(levelChangeConfirm('Lớp 6', 'primary')).toContain('8 buổi/tháng')
    expect(levelChangeConfirm('Lớp 6', 'secondary')).toContain('12 buổi/kỳ')
  })
  it('đổi số buổi đã học trước nêu buổi đầu trong app sẽ thành gì', () => {
    expect(offsetChangeConfirm('An', 0, 9, 12)).toContain('Tháng 1 · Buổi 10/12')
    expect(offsetChangeConfirm('An', 0, 8, 8)).toContain('Tháng 2 · Buổi 1/8')
  })
  it('gỡ học sinh nêu số buổi chưa thu + buổi chưa lên server', () => {
    const t = removeStudentConfirm('Linh Chi', 'Lớp 10', [{ billed: true }, {}, {}], 1)
    expect(t).toContain('3 buổi'); expect(t).toContain('2 buổi CHƯA thu tiền'); expect(t).toContain('kho giữ lại')
    expect(removeStudentConfirm('A', 'B', [{ billed: true }], 0)).not.toContain('CHƯA thu')
  })
})
