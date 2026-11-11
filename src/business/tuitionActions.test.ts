import { describe, it, expect } from 'vitest'
import { noticeDeleteBlock, sendNoticeConfirm, deleteNoticeConfirm, markPaidConfirm, markUnpaidConfirm } from './tuitionActions'
import { noticeDeleteBlockReason } from '../../server/src/utils/dataRules'

describe('tuitionActions — câu hỏi lại cho nút tiền (11/11)', () => {
  it('chặn xóa phiếu đã đóng Y HỆT server', () => {
    for (const n of [{ paymentStatus: 'paid', periodLabel: 'Buổi 1–8' }, { paymentStatus: 'unpaid', periodLabel: 'x' }, {}]) {
      expect(noticeDeleteBlock(n)).toBe(noticeDeleteBlockReason(n))
    }
  })
  it('gửi phiếu: nêu em, kỳ, số buổi tính tiền, số tiền, lý do điều chỉnh, số buổi mang dấu', () => {
    const t = sendNoticeConfirm({ studentName: 'Vũ', periodLabel: 'Tháng 2', sessionsBilled: 11, sessionCount: 12, computedAmount: 660000, finalAmount: 600000, adjustmentReason: 'giảm anh em' })
    expect(t).toContain('Vũ'); expect(t).toContain('11 buổi tính tiền'); expect(t).toContain('600.000đ')
    expect(t).toContain('tự tính 660.000đ'); expect(t).toContain('giảm anh em'); expect(t).toContain('12 buổi')
    expect(sendNoticeConfirm({ studentName: 'A', periodLabel: 'p', sessionsBilled: 8, sessionCount: 8, computedAmount: 600000, finalAmount: 600000 })).not.toContain('tự tính')
  })
  it('xóa / đã đóng / chuyển lại chưa đóng: nêu số tiền và hậu quả', () => {
    const n = { periodLabel: 'Buổi 1–8', finalAmount: 1200000, sessionIds: ['a', 'b'] }
    expect(deleteNoticeConfirm('Linh Đan', n)).toContain('1.200.000đ')
    expect(deleteNoticeConfirm('Linh Đan', n)).toContain('2 buổi')
    expect(markPaidConfirm('Linh Đan', n, 'Starters')).toContain('ĐÃ ĐÓNG 1.200.000đ')
    expect(markUnpaidConfirm('Linh Đan', n)).toContain('CHƯA ĐÓNG')
  })
})
