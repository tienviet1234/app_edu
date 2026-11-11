import { describe, it, expect } from 'vitest'
import { effectiveTuitionRate, checkStudentTuitionInput, checkNoticeSessions, scoreFieldChanges, scoreRestoreSet, checkScoreRestore, decideIfAbsent, flattenScoreContent, gradedTotal, isGradedScore, isStaleWrite, isStudentInClass, isWriteToDeletedSession, rejectedWriteMetadata, resolveScoreClassId, resolveSessionCreator, planDuplicateFix, navClicksWithoutSession, planAttendanceBackfill, classDeleteBlockReason, billedDeleteBlockReason, planBilledFlagRepair, noticeCoverage, planSessionRemoval, reviewFixResult, changedFields, noticeAttendanceDrift, billedMismatchKind, billedChangeBlockReason, dateMoveBlockReason, lonelyClassDays, planClassTransfer, perMonthOfClass, sessionLabel, numberingProblem, planInsertSession, planRemoveFromNumbering, planCompactNumbering, noticeDeleteBlockReason, paymentChangeNeeded } from './dataRules.js'

describe('billedDeleteBlockReason (xóa buổi đã thu làm buổi khác bị tính tiền lần 2)', () => {
  it('buổi đã thu: chặn, nói rõ cách làm', () => {
    expect(billedDeleteBlockReason({ billed: true })).toContain('đã thu tiền')
  })
  it('buổi chưa thu: cho xóa', () => {
    expect(billedDeleteBlockReason({ billed: false })).toBeNull()
    expect(billedDeleteBlockReason({})).toBeNull()
  })
})

describe('noticeCoverage (số buổi phiếu phủ, khác số buổi tính tiền)', () => {
  it('kiểu mới: theo danh sách buổi', () => expect(noticeCoverage({ sessionsBilled: 10, sessionIds: Array.from({ length: 12 }, (_, i) => `x${i}`) })).toBe(12))
  it('kiểu cũ: theo vị trí kỳ, kể cả buổi vắng không tính tiền', () => expect(noticeCoverage({ sessionsBilled: 11, periodFrom: 0, periodTo: 12 })).toBe(12))
  it('kỳ đầu bị cắt ngắn (học sinh chuyển vào)', () => expect(noticeCoverage({ sessionsBilled: 4, periodFrom: 0, periodTo: 4 })).toBe(4))
  it('thiếu vị trí → đành dùng số buổi tính tiền', () => expect(noticeCoverage({ sessionsBilled: 8 })).toBe(8))
})

describe('planBilledFlagRepair (phiếu phủ N buổi mà ít hơn N buổi mang dấu)', () => {
  const s = (id: string, date: string, no: number, billed = false) => ({ id, date, no, billed })
  const legacy8 = [{ sessionsBilled: 8 }]
  const lop2 = [
    ...Array.from({ length: 6 }, (_, i) => s(`b${i}`, `2026-09-${String(10 + i * 2).padStart(2, '0')}`, i + 1, true)),
    s('u7', '2026-10-16', 7), s('u8', '2026-10-21', 8), s('u9', '2026-10-23', 9),
  ]
  it('ca thật Tường Yên: thu 8, dấu 6 → đánh dấu 2 buổi chưa thu sớm nhất', () => {
    expect(planBilledFlagRepair({ live: lop2, notices: legacy8 })).toEqual({ ok: true, ids: ['u7', 'u8'], paid: 8, flagged: 6 })
  })
  it('chọn theo NGÀY, không theo số buổi (buổi ghi bù có số lớn nhưng ngày sớm)', () => {
    const live = [...lop2.slice(0, 6), s('late', '2026-10-30', 7), s('early', '2026-10-01', 9), s('mid', '2026-10-16', 8)]
    expect((planBilledFlagRepair({ live, notices: legacy8 }) as { ids: string[] }).ids).toEqual(['early', 'mid'])
  })
  it('đã khớp → không làm gì; chạy lại lần 2 cũng không làm gì', () => {
    expect(planBilledFlagRepair({ live: lop2.map((x, i) => ({ ...x, billed: i < 8 })), notices: legacy8 })).toEqual({ ok: true, ids: [], paid: 8, flagged: 8 })
  })
  it('thừa dấu thật → không tự gỡ, báo để xem tay', () => {
    expect(planBilledFlagRepair({ live: lop2.map((x) => ({ ...x, billed: true })), notices: legacy8 })).toMatchObject({ ok: false })
  })
  it('ca thật Vũ Lớp 7: kỳ [0–12] có 1 buổi vắng không phép → phiếu tính 11 buổi, 12 buổi mang dấu là ĐÚNG', () => {
    const vu = Array.from({ length: 14 }, (_, i) => s(`v${i}`, `2026-09-${String(8 + i).padStart(2, '0')}`, i + 1, i < 12))
    expect(planBilledFlagRepair({ live: vu, notices: [{ sessionsBilled: 11, periodFrom: 0, periodTo: 12 }] })).toEqual({ ok: true, ids: [], paid: 12, flagged: 12 })
  })
  it('kỳ có buổi vắng không phép mà thiếu dấu → đánh bù theo số buổi của KỲ, không theo số buổi tính tiền', () => {
    const live = lop2.slice(0, 6).concat(s('u7', '2026-10-16', 7), s('u8', '2026-10-21', 8), s('u9', '2026-10-23', 9))
    expect(planBilledFlagRepair({ live, notices: [{ sessionsBilled: 7, periodFrom: 0, periodTo: 8 }] })).toEqual({ ok: true, ids: ['u7', 'u8'], paid: 8, flagged: 6 })
  })
  it('em chỉ còn ít buổi hơn số buổi đã thu (ca Việt An chuyển lớp) → từ chối', () => {
    expect(planBilledFlagRepair({ live: lop2.slice(0, 4), notices: legacy8 })).toMatchObject({ ok: false })
  })
  it('phiếu kiểu mới mà đã khớp → không báo gì', () => {
    expect(planBilledFlagRepair({ live: lop2.map((x, i) => ({ ...x, billed: i < 8 })), notices: [{ sessionsBilled: 8, sessionIds: lop2.slice(0, 8).map((x) => x.id) }] })).toEqual({ ok: true, ids: [], paid: 8, flagged: 8 })
  })
  it('có phiếu kiểu mới (đã ghi đúng từng buổi) → không tự đánh dấu', () => {
    expect(planBilledFlagRepair({ live: lop2, notices: [{ sessionsBilled: 8, sessionIds: ['b0'] }] })).toMatchObject({ ok: false })
  })
})

describe('classDeleteBlockReason (xóa lớp không được làm mồ côi điểm và học phí)', () => {
  it('lớp đã có buổi: chặn, nói rõ số buổi và cách làm thay', () => {
    expect(classDeleteBlockReason(221)).toContain('221 buổi')
    expect(classDeleteBlockReason(1)).toContain('Đã kết thúc')
  })
  it('lớp chưa có buổi nào (tạo nhầm): cho xóa', () => {
    expect(classDeleteBlockReason(0)).toBeNull()
  })
})

describe('planAttendanceBackfill (ghi bù buổi chỉ có điểm danh, ca Lớp 7 ngày 29/10)', () => {
  const live = [
    { id: 'a', lessonNo: 1, date: '2026-10-20' },
    { id: 'b', lessonNo: 2, date: '2026-10-22' },
    { id: 'c', lessonNo: 3, date: '2026-10-31' },
    { id: 'd', lessonNo: 4, date: '2026-11-03' },
  ]
  const base = { live, date: '2026-10-29', clickedWithoutSession: true, otherClassSessions: 0, legacyPaidThrough: null }

  it('chen đúng vị trí theo ngày: buổi sau tăng 1 số, buổi trước không đổi', () => {
    expect(planAttendanceBackfill(base)).toEqual({ ok: true, lessonNo: 3, renumbers: [{ id: 'c', from: 3, to: 4 }, { id: 'd', from: 4, to: 5 }] })
  })
  it('ngày mới nhất: không đổi số buổi nào', () => {
    expect(planAttendanceBackfill({ ...base, date: '2026-11-05' })).toEqual({ ok: true, lessonNo: 5, renumbers: [] })
  })
  it('đã có buổi đúng ngày → từ chối (giáo viên vừa nhập bù, hoặc chạy lại lần 2)', () => {
    expect(planAttendanceBackfill({ ...base, date: '2026-10-22' })).toMatchObject({ ok: false })
  })
  it('không có dấu vết bấm hôm đó → từ chối, không tự suy ra buổi', () => {
    expect(planAttendanceBackfill({ ...base, clickedWithoutSession: false })).toMatchObject({ ok: false })
  })
  it('em đang có buổi ở lớp khác → từ chối', () => {
    expect(planAttendanceBackfill({ ...base, otherClassSessions: 2 })).toMatchObject({ ok: false })
  })
  it('số buổi lệch từ trước → từ chối, không tiện tay đánh lại', () => {
    expect(planAttendanceBackfill({ ...base, live: [{ id: 'a', lessonNo: 1, date: '2026-10-20' }, { id: 'b', lessonNo: 5, date: '2026-10-22' }] })).toMatchObject({ ok: false })
  })
  it('phiếu kiểu cũ đã thu theo vị trí: chen vào phần đã thu → từ chối', () => {
    expect(planAttendanceBackfill({ ...base, legacyPaidThrough: 3 })).toMatchObject({ ok: false })
  })
  it('phiếu kiểu cũ nhưng buổi mới nằm sau phần đã thu → cho phép', () => {
    expect(planAttendanceBackfill({ ...base, legacyPaidThrough: 2 })).toMatchObject({ ok: true, lessonNo: 3 })
  })
  it('đã có dấu "đã thu" theo từng buổi: phiếu cũ không còn so vị trí → cho phép, buổi mới là chưa thu', () => {
    const billedLive = live.map((s, i) => ({ ...s, billed: i < 3 }))
    expect(planAttendanceBackfill({ ...base, live: billedLive, legacyPaidThrough: 3 })).toMatchObject({ ok: true, lessonNo: 3 })
  })
})

describe('navClicksWithoutSession (bấm chuyển em mà không có gì được lưu)', () => {
  const click = (studentName: string, sessionNo: number, date = '2026-10-29') => ({ className: 'Lớp 7', studentName, date, sessionNo })
  const sessions = [{ className: 'Lớp 7', studentName: 'Minh Nhân', date: '2026-10-29' }, { className: 'Lớp 7', studentName: 'Vương Thắng', date: '2026-10-29' }]

  it('ca thật Lớp 7: em không có buổi đúng ngày bị báo, dù cùng lượt có em khác được lưu', () => {
    const r = navClicksWithoutSession([click('Thiên Vương', 0), click('Minh Nhân', 15), click('Tuấn', 0)], sessions)
    expect(r.map((x) => x.studentName)).toEqual(['Thiên Vương', 'Tuấn'])
  })
  it('lúc bấm chưa có buổi nhưng sau đó đã nhập bù → không báo nữa', () => {
    expect(navClicksWithoutSession([click('Vương Thắng', 0)], sessions)).toEqual([])
  })
  it('bấm lúc đang có buổi (sessionNo > 0) → không báo; cùng ngày cùng em chỉ báo 1 lần', () => {
    expect(navClicksWithoutSession([click('A', 3)], [])).toEqual([])
    expect(navClicksWithoutSession([click('A', 0), click('A', 0)], [])).toHaveLength(1)
  })
  it('có buổi ở LỚP KHÁC hoặc NGÀY KHÁC thì vẫn báo', () => {
    expect(navClicksWithoutSession([click('A', 0)], [{ className: 'Lớp 8', studentName: 'A', date: '2026-10-29' }, { className: 'Lớp 7', studentName: 'A', date: '2026-10-27' }])).toHaveLength(1)
  })
})

describe('planDuplicateFix (dọn cặp buổi trùng ngày — rà soát 24/10)', () => {
  type L = { id: string; lessonNo: number; date: string; billed?: boolean; notes?: string }
  const s = (id: string, lessonNo: number, date: string, billed = false, notes = ''): L => ({ id, lessonNo, date, billed, notes })
  // Dữ liệu thật Lớp 2 Tường Yên: phiếu 20/10 thu 8 buổi, chỉ 7 mang dấu.
  const tuongYen = () => [
    s('a1', 1, '2026-09-25', true), s('a2', 2, '2026-09-30', true), s('a3', 3, '2026-10-02', true), s('a4', 4, '2026-10-07', true),
    s('a5', 5, '2026-10-09', true), s('a6', 6, '2026-10-14', true), s('old', 7, '2026-10-16', true), s('new', 8, '2026-10-16'),
    s('n21', 9, '2026-10-21'), s('n23', 10, '2026-10-23'),
  ]

  it('Tường Yên: bỏ bản cũ đã thu → dấu sang bản giữ + tính bù 21/10, khớp 8 buổi trên phiếu, đánh lại số liền', () => {
    const r = planDuplicateFix({ live: tuongYen(), date: '2026-10-16', keepId: 'new', dropId: 'old', paidSessions: 8, noticedIds: [], extraBillId: 'n21' })
    expect(r).toEqual({ ok: true, ops: [
      { kind: 'delete', id: 'old', wasBilled: true },
      { kind: 'bill', id: 'new' },
      { kind: 'bill', id: 'n21' },
      { kind: 'renumber', id: 'new', from: 8, to: 7 },
      { kind: 'renumber', id: 'n21', from: 9, to: 8 },
      { kind: 'renumber', id: 'n23', from: 10, to: 9 },
    ] })
  })

  it('không tính bù thì số buổi đã thu (7) lệch phiếu (8) → TỪ CHỐI, không đoán', () => {
    const r = planDuplicateFix({ live: tuongYen(), date: '2026-10-16', keepId: 'new', dropId: 'old', paidSessions: 8, noticedIds: [] })
    expect(r.ok).toBe(false)
  })

  it('buổi tính bù phải là buổi chưa thu SỚM NHẤT (chọn 23/10 bỏ qua 21/10 → từ chối)', () => {
    expect(planDuplicateFix({ live: tuongYen(), date: '2026-10-16', keepId: 'new', dropId: 'old', paidSessions: 8, noticedIds: [], extraBillId: 'n23' }).ok).toBe(false)
  })

  it('bản bỏ chưa thu, chưa có phiếu: chỉ xóa + đánh lại số, không đụng dấu đã thu', () => {
    const live = [s('x1', 1, '2026-10-02'), s('admin', 2, '2026-10-14'), s('teacher', 3, '2026-10-14'), s('x4', 4, '2026-10-16')]
    const r = planDuplicateFix({ live, date: '2026-10-14', keepId: 'teacher', dropId: 'admin', paidSessions: null, noticedIds: [] })
    expect(r).toEqual({ ok: true, ops: [
      { kind: 'delete', id: 'admin', wasBilled: false },
      { kind: 'renumber', id: 'teacher', from: 3, to: 2 },
      { kind: 'renumber', id: 'x4', from: 4, to: 3 },
    ] })
  })

  it('chép bài tập về nhà khi bản giữ trống (Bảo Uyên); bản giữ đã có thì TỪ CHỐI, không chép đè', () => {
    const live = [s('drop', 1, '2026-10-14', false, 'Unit 3 lesson 3'), s('keep', 2, '2026-10-14')]
    const r = planDuplicateFix({ live, date: '2026-10-14', keepId: 'keep', dropId: 'drop', paidSessions: null, noticedIds: [], copyNotes: true })
    expect(r.ok && r.ops).toContainEqual({ kind: 'notes', id: 'keep', value: 'Unit 3 lesson 3' })
    live[1].notes = 'đã có'
    expect(planDuplicateFix({ live, date: '2026-10-14', keepId: 'keep', dropId: 'drop', paidSessions: null, noticedIds: [], copyNotes: true }).ok).toBe(false)
  })

  it('dữ liệu đã đổi so với lúc duyệt (còn 1 buổi / 3 buổi / sai id) → TỪ CHỐI', () => {
    const base = [s('a', 1, '2026-10-14'), s('b', 2, '2026-10-14')]
    expect(planDuplicateFix({ live: [base[0]], date: '2026-10-14', keepId: 'a', dropId: 'b', paidSessions: null, noticedIds: [] }).ok).toBe(false)
    expect(planDuplicateFix({ live: [...base, s('c', 3, '2026-10-14')], date: '2026-10-14', keepId: 'a', dropId: 'b', paidSessions: null, noticedIds: [] }).ok).toBe(false)
    expect(planDuplicateFix({ live: base, date: '2026-10-14', keepId: 'a', dropId: 'zzz', paidSessions: null, noticedIds: [] }).ok).toBe(false)
  })

  it('bản bỏ nằm trong danh sách buổi của phiếu mới → TỪ CHỐI', () => {
    const live = [s('a', 1, '2026-10-14', true), s('b', 2, '2026-10-14')]
    expect(planDuplicateFix({ live, date: '2026-10-14', keepId: 'b', dropId: 'a', paidSessions: 1, noticedIds: ['a'] }).ok).toBe(false)
  })

  it('cả 2 bản đều đã thu (Ngọc Minh Lớp 9) → TỪ CHỐI, phải người quyết', () => {
    const live = [s('a', 1, '2026-09-26', true), s('b', 2, '2026-09-26', true)]
    expect(planDuplicateFix({ live, date: '2026-09-26', keepId: 'a', dropId: 'b', paidSessions: 2, noticedIds: [] }).ok).toBe(false)
  })

  it('số buổi đã lệch TRƯỚC ngày trùng → TỪ CHỐI (không tự đánh lại cả dãy)', () => {
    const live = [s('a', 1, '2026-10-01'), s('b', 5, '2026-10-03'), s('c', 6, '2026-10-14'), s('d', 7, '2026-10-14')]
    expect(planDuplicateFix({ live, date: '2026-10-14', keepId: 'c', dropId: 'd', paidSessions: null, noticedIds: [] }).ok).toBe(false)
  })
})

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
describe('planSessionRemoval (bỏ buổi không có thật: Lớp 7 24/10, 27/10)', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 8, 12 + i * 2)).toISOString().slice(0, 10)
  // 24 buổi: kỳ 1 (1–12) phiếu cũ đã đóng, kỳ 2 (13–24) phiếu mới chưa đóng chứa 2 buổi không thật (19, 20).
  const kp = Array.from({ length: 24 }, (_, i) => ({ id: `k${i + 1}`, lessonNo: i + 1, date: day(i), billed: true }))
  const kpNotices = [
    { id: 'n1', periodFrom: 0, periodTo: 12, sessionsBilled: 12, paymentStatus: 'paid' },
    { id: 'n2', sessionIds: kp.slice(12).map((s) => s.id), sessionsBilled: 12, paymentStatus: 'unpaid' },
  ]
  it('ca thật Kim Phụng: gỡ phiếu kỳ 2 chưa đóng, xóa 2 buổi, gỡ dấu 10 buổi còn lại, đánh lại số 21–24 → 19–22', () => {
    const r = planSessionRemoval({ live: kp, removeIds: ['k19', 'k20'], notices: kpNotices, dropNoticeIds: ['n2'] })
    expect(r).toEqual({
      ok: true, deletes: ['k19', 'k20'], dropNotices: ['n2'],
      unbill: ['k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k21', 'k22', 'k23', 'k24'],
      renumber: [{ id: 'k21', from: 21, to: 19 }, { id: 'k22', from: 22, to: 20 }, { id: 'k23', from: 23, to: 21 }, { id: 'k24', from: 24, to: 22 }],
    })
  })
  const vt = kp.map((s, i) => ({ ...s, billed: i < 12 })).slice(0, 23)
  const vtNotices = [kpNotices[0]]
  it('ca thật Vương Thắng: buổi chưa thu → xóa + đánh lại số, không đụng phiếu', () => {
    const r = planSessionRemoval({ live: vt, removeIds: ['k18', 'k19'], notices: vtNotices, dropNoticeIds: [] })
    expect(r).toMatchObject({ ok: true, deletes: ['k18', 'k19'], unbill: [], dropNotices: [] })
    expect((r as { renumber: unknown[] }).renumber).toEqual([20, 21, 22, 23].map((n) => ({ id: `k${n}`, from: n, to: n - 2 })))
  })
  it('chưa sửa dấu "đã thu" (kỳ 1 mới mang dấu 9/12) → từ chối, phải chạy lệnh sửa dấu trước', () => {
    const r = planSessionRemoval({ live: vt.map((s, i) => ({ ...s, billed: i < 9 })), removeIds: ['k18', 'k19'], notices: vtNotices, dropNoticeIds: [] })
    expect(r).toMatchObject({ ok: false })
  })
  it('chạy lại lần 2 (buổi đã xóa) → từ chối', () => {
    const live = vt.filter((s) => !['k18', 'k19'].includes(s.id)).map((s, i) => ({ ...s, lessonNo: i + 1 }))
    expect(planSessionRemoval({ live, removeIds: ['k18', 'k19'], notices: vtNotices, dropNoticeIds: [] })).toMatchObject({ ok: false })
  })
  it('phiếu đã đóng tiền → không tự gỡ', () => {
    const notices = [kpNotices[0], { ...kpNotices[1], paymentStatus: 'paid' }]
    expect(planSessionRemoval({ live: kp, removeIds: ['k19', 'k20'], notices, dropNoticeIds: ['n2'] })).toMatchObject({ ok: false })
  })
  it('buổi đã thu mà không gỡ phiếu chứa nó → từ chối', () => {
    expect(planSessionRemoval({ live: kp, removeIds: ['k19', 'k20'], notices: kpNotices, dropNoticeIds: [] })).toMatchObject({ ok: false })
  })
  it('gỡ phiếu kiểu cũ → từ chối', () => {
    expect(planSessionRemoval({ live: kp.map((s, i) => ({ ...s, billed: i < 12 })), removeIds: ['k2'], notices: kpNotices, dropNoticeIds: ['n1'] })).toMatchObject({ ok: false })
  })
  it('số buổi đã lệch từ trước → từ chối, không đánh số chồng lên', () => {
    const live = vt.map((s) => (s.id === 'k5' ? { ...s, lessonNo: 1005 } : s))
    expect(planSessionRemoval({ live, removeIds: ['k18', 'k19'], notices: vtNotices, dropNoticeIds: [] })).toMatchObject({ ok: false })
  })
})

describe('reviewFixResult (sau khi sửa dữ liệu thật: không đổi gì ngoài kế hoạch)', () => {
  const s = (o: Record<string, unknown>) => ({ _id: 'a', lessonNo: 5, billed: false, notes: 'BT', updatedAt: 't1', ...o })
  const allowed = { classsessions: { fields: ['billed', 'deletedAt', 'lessonNo'] }, tuitionnotices: { deletable: true }, scores: {} }
  it('chỉ đổi trường được phép → đạt; updatedAt/__v không tính', () => {
    const r = reviewFixResult({ items: [{ coll: 'classsessions', id: 'a', before: s({}), after: s({ billed: true, updatedAt: 't2' }) }], allowed, writtenDuringRun: [{ coll: 'classsessions', id: 'a' }] })
    expect(r).toMatchObject({ ok: true, rows: [{ fields: ['billed'], verdict: 'planned' }], outside: [] })
  })
  it('lệnh đổi cả bài tập (trường không được phép) → KHÔNG đạt', () => {
    const r = reviewFixResult({ items: [{ coll: 'classsessions', id: 'a', before: s({}), after: s({ billed: true, notes: '' }) }], allowed, writtenDuringRun: [] })
    expect(r.ok).toBe(false)
    expect(r.rows[0]).toMatchObject({ fields: ['billed', 'notes'], verdict: 'unexpected' })
  })
  it('trường lạ đổi nhưng do giáo viên sửa SAU khi lệnh chạy → không tính là lỗi của lệnh, vẫn liệt kê', () => {
    const r = reviewFixResult({ items: [{ coll: 'classsessions', id: 'a', before: s({}), after: s({ billed: true, notes: 'BT mới' }), editedLater: true }], allowed, writtenDuringRun: [] })
    expect(r).toMatchObject({ ok: true, rows: [{ verdict: 'laterEdit', fields: ['billed', 'notes'] }] })
  })
  it('điểm (không được phép đổi gì) bị đổi → KHÔNG đạt', () => {
    const r = reviewFixResult({ items: [{ coll: 'scores', id: 'x', before: { total: 24 }, after: { total: 0 } }], allowed, writtenDuringRun: [] })
    expect(r.ok).toBe(false)
  })
  it('phiếu được phép xóa → đạt; buổi bị xóa hẳn (không được phép) → KHÔNG đạt', () => {
    expect(reviewFixResult({ items: [{ coll: 'tuitionnotices', id: 'n', before: {}, after: null }], allowed, writtenDuringRun: [] }).ok).toBe(true)
    expect(reviewFixResult({ items: [{ coll: 'classsessions', id: 'a', before: s({}), after: null }], allowed, writtenDuringRun: [] }).ok).toBe(false)
  })
  it('có bản ghi NGOÀI kế hoạch bị ghi trong lúc lệnh chạy → KHÔNG đạt, nêu đúng bản ghi đó', () => {
    const r = reviewFixResult({ items: [{ coll: 'classsessions', id: 'a', before: s({}), after: s({ billed: true }) }], allowed, writtenDuringRun: [{ coll: 'classsessions', id: 'a' }, { coll: 'classsessions', id: 'zz' }, { coll: 'classsessions', id: 'zz' }] })
    expect(r).toMatchObject({ ok: false, outside: [{ coll: 'classsessions', id: 'zz' }] })
  })
  it('changedFields: trường mới xuất hiện / biến mất cũng tính', () => {
    expect(changedFields({ a: 1 }, { a: 1, deletedAt: 'd' })).toEqual(['deletedAt'])
    expect(changedFields({ a: 1, b: 2 }, { a: 1 })).toEqual(['b'])
  })
})

describe('noticeAttendanceDrift (sửa điểm danh SAU khi gửi phiếu)', () => {
  const ss = (atts: Array<string | undefined>) => atts.map((a, i) => ({ id: `s${i}`, attendance: a }))
  const n = { sessionIds: ['s0', 's1', 's2', 's3'], sessionsBilled: 3, ratePerSession: 75000 }
  it('khớp (1 buổi vắng không phép, thu 3) → null', () => expect(noticeAttendanceDrift(n, ss(['present', 'absent', 'late', 'excused']))).toBeNull())
  it('buổi vắng được sửa thành có mặt → thu THIẾU 1 buổi', () => expect(noticeAttendanceDrift(n, ss(['present', 'present', 'late', 'excused']))).toEqual({ billed: 3, chargeableNow: 4, diffAmount: 75000 }))
  it('buổi có mặt bị sửa thành vắng không phép → thu THỪA', () => expect(noticeAttendanceDrift(n, ss(['absent', 'absent', 'late', 'excused']))).toEqual({ billed: 3, chargeableNow: 2, diffAmount: -75000 }))
  it('buổi chưa có bản điểm tính như "có mặt" (giống app)', () => expect(noticeAttendanceDrift(n, ss([undefined, 'absent', 'present', 'present']))).toBeNull())
  it('phiếu kiểu cũ / thiếu buổi → không kết luận', () => {
    expect(noticeAttendanceDrift({ sessionsBilled: 3 }, ss(['present']))).toBeNull()
    expect(noticeAttendanceDrift(n, ss(['present', 'absent']))).toBeNull()
  })
  it('không có giá/buổi thì suy từ số tiền', () => expect(noticeAttendanceDrift({ ...n, ratePerSession: undefined, amount: 180000 }, ss(['present', 'present', 'present', 'present']))?.diffAmount).toBe(60000))
})

describe('billedMismatchKind (lệch dấu "đã thu" theo rủi ro tiền)', () => {
  it('khớp → null', () => expect(billedMismatchKind(12, 12, 5)).toBeNull())
  it('sự cố 08/11: phiếu phủ 12, dấu 11, còn buổi chưa thu → sẽ thu lại', () => expect(billedMismatchKind(12, 11, 13)).toBe('recharge'))
  it('dấu nhiều hơn phiếu → có buổi bị ẩn, không bao giờ thu', () => expect(billedMismatchKind(11, 12, 3)).toBe('hidden'))
  it('Việt An: đóng 8, học 4 rồi chuyển lớp, không còn buổi nào → chỉ cần xem', () => expect(billedMismatchKind(8, 4, 0)).toBe('overpaid'))
})

describe('billedChangeBlockReason (ai được đổi dấu "đã thu" qua PATCH)', () => {
  it('không đổi dấu → cho qua (giáo viên sửa ngày/bài tập bình thường)', () => {
    expect(billedChangeBlockReason({ role: 'teacher', current: true, requested: undefined, inNotice: true })).toBeNull()
    expect(billedChangeBlockReason({ role: 'teacher', current: true, requested: true, inNotice: true })).toBeNull()
  })
  it('giáo viên gỡ hoặc đặt dấu → chặn', () => {
    expect(billedChangeBlockReason({ role: 'teacher', current: true, requested: false, inNotice: true })).not.toBeNull()
    expect(billedChangeBlockReason({ role: 'teacher', current: false, requested: true, inNotice: false })).not.toBeNull()
  })
  it('admin gỡ dấu buổi đang nằm trong phiếu → chặn (phải xóa phiếu)', () => expect(billedChangeBlockReason({ role: 'admin', current: true, requested: false, inNotice: true })).not.toBeNull())
  it('admin xác nhận "đã tính tiền trước đó" / gỡ dấu không thuộc phiếu → cho', () => {
    expect(billedChangeBlockReason({ role: 'admin', current: false, requested: true, inNotice: false })).toBeNull()
    expect(billedChangeBlockReason({ role: 'admin', current: true, requested: false, inNotice: false })).toBeNull()
  })
})

describe('dateMoveBlockReason (đổi ngày sang ngày em đã có buổi)', () => {
  it('ca Linh Đan: đổi sang 30/09 khi đã có buổi 30/09 → chặn', () => expect(dateMoveBlockReason('2026-09-30', ['2026-09-25', '2026-09-30'])).toContain('30/09'))
  it('ngày trống → cho', () => expect(dateMoveBlockReason('2026-10-01', ['2026-09-30'])).toBeNull())
})

describe('lonelyClassDays (ngày chỉ vài em có buổi)', () => {
  const day = (d: string, names: string[]) => names.map((studentName) => ({ date: d, studentName }))
  const all = Array.from({ length: 11 }, (_, i) => `HS${i}`)
  it('ca thật Lớp 7: 24/10, 27/10 chỉ 2/11 em giữa các ngày đủ lớp → báo đúng 2 ngày', () => {
    const r = lonelyClassDays({ className: 'Lớp 7', rosterSize: 11, sessions: [...day('2026-10-22', all), ...day('2026-10-24', ['Kim Phụng', 'Vương Thắng']), ...day('2026-10-27', ['Kim Phụng', 'Vương Thắng']), ...day('2026-10-29', all)] })
    expect(r).toEqual(['Lớp 7 24/10: chỉ 2/11 em có buổi (Kim Phụng, Vương Thắng)', 'Lớp 7 27/10: chỉ 2/11 em có buổi (Kim Phụng, Vương Thắng)'])
  })
  it('chỉ xét từ ngày sinceDate', () => {
    const r = lonelyClassDays({ className: 'Lớp 7', rosterSize: 11, sessions: [...day('2026-10-22', all), ...day('2026-10-24', ['A']), ...day('2026-10-29', all), ...day('2026-11-03', ['B'])], sinceDate: '2026-11-01' })
    expect(r).toHaveLength(1)
  })
  it('lớp nhỏ (< 4 em) hoặc lớp chưa có ngày đông → không báo', () => {
    expect(lonelyClassDays({ className: 'X', rosterSize: 3, sessions: day('2026-10-24', ['A']) })).toEqual([])
    expect(lonelyClassDays({ className: 'X', rosterSize: 10, sessions: [...day('2026-10-24', ['A']), ...day('2026-10-25', ['B'])] })).toEqual([])
  })
})

describe('planClassTransfer ("Chuyển lớp": lịch sử lớp cũ ở lại lớp cũ)', () => {
  const s = (id: string, date: string, billed = false) => ({ id, date, billed })
  // Ca thật Linh Đan: Lớp 2 học 18/09–09/10, Starters mở 13/10.
  const lop2 = [s('a', '2026-09-18'), s('b', '2026-09-23'), s('c', '2026-09-25'), s('d', '2026-09-30'), s('e', '2026-10-07'), s('f', '2026-10-09')]
  const starters = [s('n1', '2026-10-13'), s('n2', '2026-10-15')]
  it('ca thật Linh Đan: 6 buổi Lớp 2 ở lại Lớp 2 (Buổi 1–6), Starters bắt đầu Buổi 1 = 13/10', () => {
    const r = planClassTransfer({ oldSessions: lop2, newSessions: starters })
    expect(r).toMatchObject({ ok: true, transferDate: '2026-10-13' })
    if (!r.ok) return
    expect(r.stay.map((x) => [x.id, x.newNo])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5], ['f', 6]])
    expect(r.move.map((x) => [x.id, x.newNo, x.source])).toEqual([['n1', 1, 'new'], ['n2', 2, 'new']])
  })
  it('buổi lỡ ghi ở lớp cũ SAU ngày chuyển được dời sang lớp mới, xếp theo ngày', () => {
    const r = planClassTransfer({ oldSessions: [...lop2, s('late', '2026-10-14')], newSessions: starters })
    expect(r.ok && r.move.map((x) => [x.id, x.newNo])).toEqual([['n1', 1], ['late', 2], ['n2', 3]])
  })
  it('sau khi gộp có 2 buổi cùng ngày ở lớp mới (ca 30/09 cũ) → từ chối, nêu ngày', () => {
    const r = planClassTransfer({ oldSessions: lop2, newSessions: [s('x', '2026-09-30'), ...starters], transferDate: '2026-09-30' })
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toContain('2026-09-30')
  })
  it('lớp cũ đang có 2 buổi cùng ngày → từ chối', () => {
    expect(planClassTransfer({ oldSessions: [...lop2, s('d2', '2026-09-30')], newSessions: starters })).toMatchObject({ ok: false })
  })
  it('buổi đã thu tiền ở lớp cũ nằm sau ngày chuyển → từ chối (không dời tiền giữa 2 lớp)', () => {
    expect(planClassTransfer({ oldSessions: [...lop2, s('paid', '2026-10-14', true)], newSessions: starters })).toMatchObject({ ok: false })
  })
  it('tài khoản mới chưa có buổi nào: mọi buổi cũ ở lại lớp cũ, không dời gì', () => {
    const r = planClassTransfer({ oldSessions: lop2, newSessions: [] })
    expect(r.ok && [r.stay.length, r.move.length, r.transferDate]).toEqual([6, 0, null])
  })
  it('admin nhập ngày chuyển sớm hơn buổi đầu ở lớp mới', () => {
    const r = planClassTransfer({ oldSessions: lop2, newSessions: starters, transferDate: '2026-10-07' })
    expect(r.ok && [r.stay.length, r.move.map((x) => x.id)]).toEqual([4, ['e', 'f', 'n1', 'n2']])
  })
})

describe('Số buổi luôn 1..n trong mỗi lớp (10/11)', () => {
  it('perMonthOfClass: Cấp 1 = 8, Cấp 2–3 = 12, chọn tay thắng tên lớp', () => {
    expect(perMonthOfClass({ name: 'Lớp 2' })).toBe(8)
    expect(perMonthOfClass({ name: 'Lớp 7' })).toBe(12)
    expect(perMonthOfClass({ name: 'Lớp Starters', level: 'primary' })).toBe(8)
  })
  it('sessionLabel: "Tháng k · Buổi m/8", m không bao giờ vượt 8/12', () => {
    expect(sessionLabel(8, 8)).toBe('Tháng 1 · Buổi 8/8')
    expect(sessionLabel(9, 8)).toBe('Tháng 2 · Buổi 1/8')
    expect(sessionLabel(9, 12)).toBe('Tháng 1 · Buổi 9/12')
    expect(sessionLabel(13, 12)).toBe('Tháng 2 · Buổi 1/12')
    expect(sessionLabel(3, 8, 5)).toBe('Tháng 1 · Buổi 8/8')
  })
  it('numberingProblem: đúng 1..n → null; ca Linh Đan thiếu Buổi 8 → báo thiếu, nêu nhãn dễ đọc', () => {
    expect(numberingProblem([3, 1, 2], 8)).toBeNull()
    expect(numberingProblem([1, 2, 3, 4, 5, 6, 7, 9], 8)).toContain('thiếu Tháng 1 · Buổi 8/8')
  })
  it('numberingProblem: trùng số / nhảy số ("Buổi 15" khi mới có 14 buổi) → báo', () => {
    expect(numberingProblem([1, 2, 2], 12)).toContain('2 buổi cùng số Tháng 1 · Buổi 2/12')
    expect(numberingProblem([...Array.from({ length: 13 }, (_, i) => i + 1), 15], 12)).toContain('vượt quá: Tháng 2 · Buổi 3/12')
  })
  const ex = [{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'b', no: 2, date: '2026-10-03' }, { id: 'c', no: 3, date: '2026-10-08' }]
  it('planInsertSession theo ngày: chèn giữa, các buổi sau lùi 1 số', () => {
    expect(planInsertSession(ex, { date: '2026-10-05' }, 8)).toEqual({ ok: true, newNo: 3, shifts: [{ id: 'c', from: 3, to: 4 }] })
    expect(planInsertSession(ex, { date: '2026-10-10' }, 8)).toEqual({ ok: true, newNo: 4, shifts: [] })
    expect(planInsertSession([], { date: '2026-10-10' }, 8)).toEqual({ ok: true, newNo: 1, shifts: [] })
  })
  it('planInsertSession giữ thứ tự giáo viên tự xếp (không đánh lại cả dãy theo ngày)', () => {
    const manual = [{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'x', no: 2, date: '2026-10-20' }, { id: 'b', no: 3, date: '2026-10-03' }]
    const r = planInsertSession(manual, { date: '2026-10-25' }, 8)
    expect(r).toEqual({ ok: true, newNo: 4, shifts: [] })
  })
  it('planInsertSession số gõ tay: trong 1..n+1 thì chèn, ngoài khoảng thì từ chối bằng nhãn dễ đọc', () => {
    expect(planInsertSession(ex, { date: '2026-10-30', requestedNo: 2 }, 8)).toEqual({ ok: true, newNo: 2, shifts: [{ id: 'c', from: 3, to: 4 }, { id: 'b', from: 2, to: 3 }] })
    const r = planInsertSession(ex, { date: '2026-10-30', requestedNo: 9 }, 8)
    expect(r).toMatchObject({ ok: false })
    expect(!r.ok && r.reason).toContain('Tháng 1 · Buổi 4/8')
  })
  it('planInsertSession: dãy hiện tại đã sai → từ chối, không chèn chồng lên', () => {
    expect(planInsertSession([{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'b', no: 3, date: '2026-10-03' }], { date: '2026-10-05' }, 8)).toMatchObject({ ok: false })
  })
  it('planRemoveFromNumbering: xóa giữa → các buổi sau lùi 1 số, không để trống', () => {
    expect(planRemoveFromNumbering(ex, 'b')).toEqual([{ id: 'c', from: 3, to: 2 }])
    expect(planRemoveFromNumbering(ex, 'c')).toEqual([])
  })
})

describe('planCompactNumbering — sửa dữ liệu cũ sai số buổi (10/11)', () => {
  it('Linh Đan Starters 1..15, 17 → chỉ buổi 17 thành 16', () => {
    const ss = Array.from({ length: 15 }, (_, i) => ({ id: `s${i + 1}`, no: i + 1, date: `2026-10-${String(i + 1).padStart(2, '0')}` }))
    expect(planCompactNumbering([...ss, { id: 'x', no: 17, date: '2026-11-10' }])).toEqual([{ id: 'x', from: 17, to: 16 }])
    expect(numberingProblem([...ss.map((s) => s.no), 16], 8)).toBeNull()
  })
  it('em đã rời lớp, 1 buổi mang số 2 → thành 1', () => {
    expect(planCompactNumbering([{ id: 'a', no: 2, date: '2026-09-17' }])).toEqual([{ id: 'a', from: 2, to: 1 }])
  })
  it('trùng số: buổi ngày sớm hơn giữ số, buổi sau và các buổi phía sau lùi 1; giữ thứ tự giáo viên tự xếp', () => {
    expect(planCompactNumbering([{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'c', no: 2, date: '2026-10-09' }, { id: 'b', no: 2, date: '2026-10-05' }, { id: 'd', no: 3, date: '2026-10-02' }]))
      .toEqual([{ id: 'c', from: 2, to: 3 }, { id: 'd', from: 3, to: 4 }])
  })
  it('dãy đã đúng → không đổi gì (chạy lại lần 2 không làm gì)', () => {
    expect(planCompactNumbering([{ id: 'a', no: 1, date: '2026-10-01' }, { id: 'b', no: 2, date: '2026-10-03' }])).toEqual([])
  })
})

describe('Phiếu học phí đã đóng / bấm 2 lần (11/11)', () => {
  it('phiếu ĐÃ ĐÓNG không xóa thẳng được — phải chuyển lại chưa đóng trước', () => {
    expect(noticeDeleteBlockReason({ paymentStatus: 'paid', periodLabel: 'Buổi 1–8' })).toContain('chuyển lại chưa đóng')
    expect(noticeDeleteBlockReason({ paymentStatus: 'unpaid' })).toBeNull()
    expect(noticeDeleteBlockReason({})).toBeNull()
  })
  it('bấm lại đúng trạng thái đang có → không ghi gì (giữ ngày đóng)', () => {
    expect(paymentChangeNeeded('paid', 'paid')).toBe(false)
    expect(paymentChangeNeeded('unpaid', 'unpaid')).toBe(false)
    expect(paymentChangeNeeded(undefined, 'unpaid')).toBe(false)
    expect(paymentChangeNeeded('unpaid', 'paid')).toBe(true)
    expect(paymentChangeNeeded('paid', 'unpaid')).toBe(true)
  })
})
