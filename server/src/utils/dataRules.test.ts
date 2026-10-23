import { describe, it, expect } from 'vitest'
import { effectiveTuitionRate, checkStudentTuitionInput, checkNoticeSessions, scoreFieldChanges, scoreRestoreSet, checkScoreRestore, decideIfAbsent, flattenScoreContent, gradedTotal, isGradedScore, isStaleWrite, isStudentInClass, isWriteToDeletedSession, rejectedWriteMetadata, resolveScoreClassId, resolveSessionCreator } from './dataRules.js'

describe('isGradedScore / gradedTotal (buổi chỉ có ghi chú KHÔNG phải 0 điểm)', () => {
  it('buổi admin thêm bù chỉ có ghi chú (Trần Đan 12/09 "Con chưa hoàn thành video") → không tính vào điểm TB', () => {
    const sc = { attendance: 'present', total: 0, scores: {}, ticks: {}, choice: {}, parts: {}, skip: {}, ev: {}, note: 'Con chưa hoàn thành video trước lễ' }
    expect(isGradedScore(sc)).toBe(false)
    expect(gradedTotal(sc)).toBeNull()
  })
  it('chỉ có ô trống / mảng rỗng / phần nhỏ rỗng → vẫn là chưa chấm', () => {
    expect(isGradedScore({ attendance: 'late', total: 0, scores: { mini: '' }, ticks: { hw: [] }, parts: { vocab: {} } })).toBe(false)
  })
  it('có chấm (điểm / tích / lựa chọn / phần nhỏ / "không làm") → tính, kể cả tổng 0 thật', () => {
    expect(gradedTotal({ attendance: 'present', total: 85, scores: { mini: 8 } })).toBe(85)
    expect(isGradedScore({ ticks: { attitude: ['a_focus'] } })).toBe(true)
    expect(isGradedScore({ choice: { hw: 'none' } })).toBe(true)
    expect(isGradedScore({ parts: { vocab: { pron: 0 } } })).toBe(true)
    expect(gradedTotal({ attendance: 'present', total: 0, skip: { video: true } })).toBe(0)
  })
  it('vắng không phép = 0 điểm thật; vắng có phép = không tính', () => {
    expect(gradedTotal({ attendance: 'absent', total: 0 })).toBe(0)
    expect(gradedTotal({ attendance: 'excused', total: 0, scores: { mini: 5 } })).toBeNull()
  })
})

describe('rejectedWriteMetadata (server từ chối lưu → vẫn giữ nội dung trong nhật ký)', () => {
  it('tạo buổi bị từ chối vì trùng số (sự cố 17–18/10 Trần Đan, Ken) → nhật ký có đủ học sinh/ngày/số/bài tập', () => {
    const m = rejectedWriteMetadata('DUPLICATE_NO', { classId: 'c', studentId: 's', lessonNo: 9, scheduledAt: '2026-10-17T00:00:00.000Z', notes: 'Hoàn thành trang 32', title: 'Buổi 9' })
    expect(m).toEqual({ code: 'DUPLICATE_NO', classId: 'c', studentId: 's', lessonNo: 9, scheduledAt: '2026-10-17T00:00:00.000Z', notes: 'Hoàn thành trang 32' })
  })
  it('lưu điểm bị từ chối → giữ nguyên nội dung điểm để lấy lại được', () => {
    const m = rejectedWriteMetadata('CONFLICT', { sessionId: 'x', studentId: 's', attendance: 'late', scores: { mini: 8 }, parts: { vocab: { pron: 6 } }, note: 'Dò từ vựng 9/10', total: 83, baseUpdatedAt: 't0' })
    expect(m).toMatchObject({ code: 'CONFLICT', attendance: 'late', scores: { mini: 8 }, parts: { vocab: { pron: 6 } }, note: 'Dò từ vựng 9/10', total: 83, baseUpdatedAt: 't0' })
  })
  it('bỏ trường lạ / trống, cắt chuỗi quá dài', () => {
    const m = rejectedWriteMetadata('X', { password: 'nope', note: '', notes: 'a'.repeat(5000) })
    expect(m.password).toBeUndefined()
    expect(m.note).toBeUndefined()
    expect((m.notes as string).length).toBe(1000)
  })
})

describe('checkScoreRestore (khôi phục điểm bị bản cũ đè — không được làm mất thêm ô nào)', () => {
  // Bản bị đè thật (Lớp 10 Hữu Hoàn 17/09): mất Mini/Nghe/Thái độ, còn lại ô khác.
  const wiped = { attendance: 'present', scores: {}, ticks: { hw: ['h_ontime'] }, note: '' }
  const full = { attendance: 'present', scores: { mini: 8, listen: 1 }, ticks: { hw: ['h_ontime'], attitude: ['a_speak', 'a_focus'] }, note: '' }
  it('bản khôi phục chứa trọn bản hiện tại → cho khôi phục, liệt kê ô được lấy lại', () => {
    const r = checkScoreRestore(wiped, full)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.added.sort()).toEqual(['scores.listen', 'scores.mini', 'ticks.attitude'])
  })
  it('ai đó đã sửa sau khi bị đè (ô khác giá trị) → KHÔNG khôi phục', () => {
    const editedLater = { ...wiped, scores: { mini: 9 } }
    expect(checkScoreRestore(editedLater, full).ok).toBe(false)
  })
  it('bản hiện tại có ô mà bản khôi phục không có → KHÔNG khôi phục (sẽ mất ô đó)', () => {
    const extra = { ...wiped, choice: { hw: 'full' } }
    expect(checkScoreRestore(extra, full).ok).toBe(false)
  })
  it('đổi điểm danh sau khi bị đè (vắng ≠ có mặt) → KHÔNG khôi phục', () => {
    expect(checkScoreRestore({ ...wiped, attendance: 'absent' }, full).ok).toBe(false)
  })
  it('ghi chú bị cắt ngắn → bản khôi phục dài hơn ở cuối thì được (Quang Huy 15/09)', () => {
    const cur = { note: 'Còn nói chuyện nhiều với Thịnh' }
    const tgt = { note: 'Còn nói chuyện nhiều với Thịnh. KHÔNG LÀM BÀI NGHE', ticks: { hw: ['h_neat'] } }
    expect(checkScoreRestore(cur, tgt).ok).toBe(true)
  })
  it('ghi chú khác hẳn → KHÔNG khôi phục', () => {
    expect(checkScoreRestore({ note: 'Đã sửa lại' }, { note: 'Bản cũ khác' }).ok).toBe(false)
  })
  it('đã giống hệt (đã khôi phục rồi / chạy lại lần 2) → không làm gì', () => {
    expect(checkScoreRestore(full, full).ok).toBe(false)
  })
  it('"8" và 8 coi là như nhau, thứ tự tick không quan trọng', () => {
    expect(flattenScoreContent({ scores: { mini: '8' }, ticks: { a: ['y', 'x'] } }))
      .toEqual(flattenScoreContent({ scores: { mini: 8 }, ticks: { a: ['x', 'y'] } }))
  })
})

describe('isWriteToDeletedSession (lưu điểm thật vào buổi đã xóa)', () => {
  it('buổi đã xóa → từ chối (trước đây ghi + báo thành công, điểm 10/10–11/10 của Phú biến mất)', () => {
    expect(isWriteToDeletedSession({ deletedAt: new Date('2026-10-16T02:40:00Z') })).toBe(true)
  })
  it('buổi không tồn tại → từ chối (không tạo điểm mồ côi)', () => {
    expect(isWriteToDeletedSession(null)).toBe(true)
  })
  it('buổi còn → cho ghi', () => {
    expect(isWriteToDeletedSession({ deletedAt: null })).toBe(false)
    expect(isWriteToDeletedSession({})).toBe(false)
  })
})

describe('resolveScoreClassId', () => {
  it('lấy classId theo BUỔI HỌC, bỏ qua classId cũ máy gửi lên (học sinh vừa chuyển lớp)', () => {
    expect(resolveScoreClassId({ classId: 'lop-moi' }, 'lop-cu')).toBe('lop-moi')
  })
  it('buổi không có classId (bản ghi cũ) → dùng classId gửi lên', () => {
    expect(resolveScoreClassId({}, 'lop-a')).toBe('lop-a')
    expect(resolveScoreClassId(null, 'lop-a')).toBe('lop-a')
  })
})

describe('decideIfAbsent (đồng bộ nền / khôi phục — không bao giờ ghi đè)', () => {
  it('đã có điểm → bỏ qua, KHÔNG ghi đè bằng bản trên máy', () => {
    expect(decideIfAbsent({}, { total: 75 })).toBe('skipExisting')
  })
  it('buổi đã bị xóa → bỏ qua, không ghi vào buổi đã xóa', () => {
    expect(decideIfAbsent({ deletedAt: new Date() }, null)).toBe('skipDeleted')
  })
  it('buổi không tồn tại → bỏ qua (không tạo điểm mồ côi)', () => {
    expect(decideIfAbsent(null, null)).toBe('skipDeleted')
  })
  it('buổi còn, chưa có điểm → ghi (VD tạo buổi được nhưng gửi điểm lỗi)', () => {
    expect(decideIfAbsent({ deletedAt: null }, null)).toBe('write')
  })
})

describe('isStaleWrite (2 máy cùng sửa 1 buổi)', () => {
  it('máy khác đã lưu bản MỚI HƠN bản máy này dựa vào → từ chối (không để bản lưu sau đè mất)', () => {
    expect(isStaleWrite('2026-10-20T10:00:05.000Z', '2026-10-20T10:00:00.000Z')).toBe(true)
  })
  it('server vẫn đúng bản máy này đã dựa vào → cho ghi', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z')).toBe(false)
  })
  it('không gửi base (buổi mới / dữ liệu cũ) → không kiểm tra, ghi như trước', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', undefined)).toBe(false)
  })
  it('server chưa có điểm → cho ghi', () => {
    expect(isStaleWrite(null, '2026-10-20T10:00:00.000Z')).toBe(false)
  })
  it('base rác → không chặn nhầm', () => {
    expect(isStaleWrite('2026-10-20T10:00:00.000Z', 'abc')).toBe(false)
  })
})

describe('isStudentInClass', () => {
  it('học sinh đã gộp/chuyển khỏi lớp → false (không tạo lại buổi cũ)', () => {
    expect(isStudentInClass({ studentIds: ['a', 'b'] }, 'c')).toBe(false)
  })
  it('còn trong lớp → true (so theo chuỗi, ObjectId cũng được)', () => {
    expect(isStudentInClass({ studentIds: [{ toString: () => 'a' }] }, 'a')).toBe(true)
  })
  it('lớp không còn → false', () => {
    expect(isStudentInClass(null, 'a')).toBe(false)
  })
})

describe('resolveSessionCreator', () => {
  it('admin đẩy hộ → ghi đúng giáo viên chủ máy là người tạo (lương/Thống kê buổi)', () => {
    expect(resolveSessionCreator('admin', 'admin-id', 'teacher-id')).toBe('teacher-id')
  })
  it('giáo viên KHÔNG được ghi tên người khác', () => {
    expect(resolveSessionCreator('teacher', 'teacher-id', 'other-id')).toBe('teacher-id')
  })
  it('không chỉ định → chính người gọi', () => {
    expect(resolveSessionCreator('admin', 'admin-id')).toBe('admin-id')
  })
})

describe('checkNoticeSessions (phiếu học phí kèm danh sách buổi — chặn thu trùng)', () => {
  const S = 's'.repeat(24), C = 'c'.repeat(24), OTHER = 'o'.repeat(24)
  const sess = (id: string, over: Record<string, unknown> = {}) => ({ _id: id, studentId: S, classId: C, deletedAt: null, ...over })
  const base = { studentId: S, classId: C, requested: ['a', 'b'], sessions: [sess('a'), sess('b')], alreadyNoticed: [] as string[] }
  it('buổi hợp lệ, chưa nằm trong phiếu nào → cho tạo', () => {
    expect(checkNoticeSessions(base)).toEqual({ ok: true })
  })
  it('buổi đã nằm trong phiếu khác → từ chối (thu trùng tiền)', () => {
    expect(checkNoticeSessions({ ...base, alreadyNoticed: ['b'] })).toEqual({ ok: false, code: 'ALREADY_BILLED', sessionIds: ['b'] })
  })
  it('buổi không có trên server (còn nằm trên máy) → từ chối — sự cố Lớp 7 phiếu 16/10', () => {
    expect(checkNoticeSessions({ ...base, sessions: [sess('a')] })).toEqual({ ok: false, code: 'NOT_FOUND', sessionIds: ['b'] })
  })
  it('buổi của học sinh khác / lớp khác → từ chối', () => {
    expect(checkNoticeSessions({ ...base, sessions: [sess('a'), sess('b', { studentId: OTHER })] }).ok).toBe(false)
    expect(checkNoticeSessions({ ...base, sessions: [sess('a'), sess('b', { classId: OTHER })] })).toMatchObject({ code: 'WRONG_STUDENT' })
  })
  it('buổi đã xóa → từ chối', () => {
    expect(checkNoticeSessions({ ...base, sessions: [sess('a'), sess('b', { deletedAt: new Date() })] })).toMatchObject({ code: 'DELETED', sessionIds: ['b'] })
  })
})
describe('scoreFieldChanges / scoreRestoreSet (trang Lịch sử điểm của admin)', () => {
  it('liệt kê đúng ô đổi, bỏ qua khác biệt không đáng kể ("8" = 8, thứ tự tick)', () => {
    const before = { attendance: 'present', scores: { mini: '8', listen: 5 }, ticks: { attitude: ['a', 'b'] }, note: 'cũ' }
    const after = { attendance: 'present', scores: { mini: 8, listen: 6 }, ticks: { attitude: ['b', 'a'] }, note: 'mới' }
    expect(scoreFieldChanges(before, after)).toEqual([
      { field: 'note', before: 'cũ', after: 'mới' },
      { field: 'scores.listen', before: '5', after: '6' },
    ])
  })
  it('ô bị xóa / ô mới thêm', () => {
    expect(scoreFieldChanges({ scores: { mini: 8 } }, { scores: {}, choice: { hw: 'full' } })).toEqual([
      { field: 'choice.hw', before: null, after: 'full' },
      { field: 'scores.mini', before: '8', after: null },
    ])
  })
  it('khôi phục: chỉ nội dung + tổng, ô bản cũ không có thì để trống (không giữ ô của bản hiện tại)', () => {
    const set = scoreRestoreSet({ _id: 'x', sessionId: 's', studentId: 'u', classId: 'c', recordedBy: 'r', scores: { mini: 8 }, total: 81 })
    expect(set).toEqual({ attendance: 'present', scores: { mini: 8 }, tags: {}, ticks: {}, choice: {}, parts: {}, skip: {}, ev: {}, note: '', total: 81 })
    expect(Object.keys(set)).not.toContain('sessionId')
  })
})
describe('checkStudentTuitionInput (học phí riêng từng học sinh — hồ sơ tiền bạc)', () => {
  it('giá riêng/buổi hợp lệ', () => {
    expect(checkStudentTuitionInput({ mode: 'rate', value: 70000, reason: ' anh em ruột ' })).toEqual({ ok: true, rule: { mode: 'rate', value: 70000, reason: 'anh em ruột' } })
    expect(checkStudentTuitionInput({ mode: 'rate', value: 0, reason: 'học bổng' }).ok).toBe(true)
  })
  it('giảm/tăng % hợp lệ (âm = giảm, dương = tăng, 2 chữ số thập phân)', () => {
    expect(checkStudentTuitionInput({ mode: 'percent', value: -10, reason: 'giảm' }).ok).toBe(true)
    expect(checkStudentTuitionInput({ mode: 'percent', value: 12.5, reason: 'tăng' }).ok).toBe(true)
  })
  it('từ chối: thiếu lý do, kiểu lạ, số không hợp lệ', () => {
    expect(checkStudentTuitionInput({ mode: 'rate', value: 70000, reason: '  ' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'amount', value: -50000, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'rate', value: '70000', reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'rate', value: 70000.5, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'rate', value: -1, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'rate', value: Number.NaN, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'percent', value: 0, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'percent', value: -101, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'percent', value: 10.123, reason: 'x' }).ok).toBe(false)
    expect(checkStudentTuitionInput({ mode: 'rate', value: 1, reason: 'x'.repeat(201) }).ok).toBe(false)
    expect(checkStudentTuitionInput(null).ok).toBe(false)
  })
})
describe('effectiveTuitionRate (giá/buổi thực của 1 học sinh — cùng công thức frontend)', () => {
  it('không có học phí riêng → giá lớp', () => {
    expect(effectiveTuitionRate(75000, null)).toBe(75000)
    expect(effectiveTuitionRate(75000, undefined)).toBe(75000)
  })
  it('giá riêng/buổi → đúng giá riêng (không phụ thuộc giá lớp)', () => {
    expect(effectiveTuitionRate(75000, { mode: 'rate', value: 70000 })).toBe(70000)
    expect(effectiveTuitionRate(75000, { mode: 'rate', value: 0 })).toBe(0)
  })
  it('giảm/tăng % → làm tròn tới đồng, không âm', () => {
    expect(effectiveTuitionRate(75000, { mode: 'percent', value: -10 })).toBe(67500)
    expect(effectiveTuitionRate(75000, { mode: 'percent', value: 12.5 })).toBe(84375)
    expect(effectiveTuitionRate(70001, { mode: 'percent', value: -33.33 })).toBe(46670)
    expect(effectiveTuitionRate(75000, { mode: 'percent', value: -100 })).toBe(0)
  })
})