import { describe, it, expect } from 'vitest'
import { scoresLines, sessionDetailRowsForSheet, type TuitionSessionDetailRow } from './excel'

const sessionDetailsOf2 = (rows: TuitionSessionDetailRow[]) => sessionDetailRowsForSheet(rows, false)
const row = (over: Partial<TuitionSessionDetailRow>): TuitionSessionDetailRow => ({ studentName: 'Hữu Phước', no: 1, date: '2026-10-10', homework: 'Unit 3', status: '', ...over })

describe('file gửi phụ huynh — bảng chi tiết từng buổi (mẫu giáo viên 23/10)', () => {
  it('Điểm số: MỖI tiêu chí 1 dòng, mỗi việc đã tích 1 dòng ✓, kết quả đúng/sai 1 dòng', () => {
    const text = scoresLines([
      { key: 'hw', label: 'Bài tập về nhà', value: '30/30', selectedLabel: 'Làm đầy đủ', ratioText: 'Đúng 10/10 câu (100%)' },
      { key: 'att', label: 'Thái độ học tập', value: '8/20', checkedItems: [{ label: 'Chủ động phát biểu', pts: 4 }, { label: 'Chú ý nghe giảng', pts: 4 }] },
    ])
    expect(text.split('\n')).toEqual([
      'Bài tập về nhà: 30/30 (Làm đầy đủ)',
      '— Đúng 10/10 câu (100%)',
      'Thái độ học tập: 8/20',
      '   ✓ Chủ động phát biểu 4đ',
      '   ✓ Chú ý nghe giảng 4đ',
    ])
  })

  it('Nhận xét: BỎ câu hệ thống tự sinh (lặp lại cột Điểm số), GIỮ nguyên ghi chú giáo viên gõ', () => {
    const rows = sessionDetailRowsForSheet([
      row({ status: 'ĐÃ LÀM BÀI TẬP VỀ NHÀ. chủ động phát biểu, chú ý nghe giảng.', isAuto: true }),
      row({ no: 2, status: '- pencil - pen (miss spelling)', isAuto: false }),
    ], false)
    expect(rows[0][5]).toBe('')
    expect(rows[1][5]).toBe('- pencil - pen (miss spelling)')
  })

  it('Nhận xét: có bản dành cho phụ huynh (parentStatus) thì dùng bản đó', () => {
    const rows = sessionDetailsOf2([row({ status: 'ĐÃ LÀM BÀI TẬP VỀ NHÀ. Cần cải thiện: hợp tác.', isAuto: true, parentStatus: 'ĐÃ LÀM BÀI TẬP VỀ NHÀ.' })])
    expect(rows[0][5]).toBe('ĐÃ LÀM BÀI TẬP VỀ NHÀ.')
  })

  it('Tên học sinh chỉ ghi ở dòng đầu của mỗi em (các dòng sau gộp ô), sang em khác ghi lại', () => {
    const rows = sessionDetailRowsForSheet([row({}), row({ no: 2 }), row({ studentName: 'Kim Ngân', no: 1 })], false)
    expect(rows.map((r) => r[0])).toEqual(['Hữu Phước', '', 'Kim Ngân'])
  })

  it('6 cột (Học sinh, STT, Buổi, Ngày học, Điểm số, Nhận xét); có cột Số tiền khi xuất Tổng quan học phí; ngày ghi kèm thứ', () => {
    expect(sessionDetailRowsForSheet([row({})], false)[0]).toHaveLength(6)
    const withAmount = sessionDetailRowsForSheet([row({ amount: '75.000đ' })], true)[0]
    expect(withAmount).toHaveLength(7)
    expect(withAmount[6]).toBe('75.000đ')
    expect(withAmount[3]).toBe('T7 10/10/2026')
  })

  it('bộ đếm theo ngày tháng năm (17/11): buổi xếp theo NGÀY dù số buổi lệch, STT 1..n, qua năm mới vẫn đúng', () => {
    const rows = sessionDetailRowsForSheet([
      row({ no: 'Tháng 1 · Buổi 3/8', sortNo: 3, date: '2027-01-02' }),
      row({ no: 'Tháng 1 · Buổi 1/8', sortNo: 1, date: '2026-12-28' }),
      row({ no: 'Tháng 1 · Buổi 2/8', sortNo: 2, date: '2026-12-30' }),
    ], false)
    expect(rows.map((r) => [r[0], r[1], r[2], r[3]])).toEqual([
      ['Hữu Phước', 1, 'Tháng 1 · Buổi 1/8', 'T2 28/12/2026'],
      ['', 2, 'Tháng 1 · Buổi 2/8', 'T4 30/12/2026'],
      ['', 3, 'Tháng 1 · Buổi 3/8', 'T7 02/01/2027'],
    ])
  })
})
