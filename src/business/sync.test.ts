import { describe, it, expect } from 'vitest'
import {
  pruneGoneFromServer, resolvePlausibleNo, syncStudentsFromServer, adoptServerSession, pendingSessionsOf, markSessionSaved,
  markConflict, resolveConflict, collectOrphans, appendOrphans, sameDateClash,
  type ServerSessionForSync, type ServerScoreForSync,
} from './sync'
import { emptyEntry, normalize } from './seed'
import type { Session } from '@/types'

describe('normalize (mở app)', () => {
  it('GIỮ cờ billed/dirty/synced/maxes — trước đây bỏ mất billed mỗi lần mở app (buổi đã thu tiền bị đếm lại)', () => {
    const d = normalize({ classes: [{ id: 'c', students: [{ id: 's', sessions: [
      { id: 'x', no: 1, date: '2026-10-01', billed: true, dirty: true, synced: true, maxes: { mini: 30 }, entry: {} },
    ] }] }] })
    expect(d.classes[0].students[0].sessions[0]).toMatchObject({ billed: true, dirty: true, synced: true, maxes: { mini: 30 } })
  })

  it('GIỮ mốc baseUpdatedAt, xung đột đang chờ chọn, và kho giữ lại (orphans)', () => {
    const conflict = { entry: emptyEntry(), total: 0, updatedAt: 't1' }
    const d = normalize({
      classes: [{ id: 'c', students: [{ id: 's', sessions: [{ id: 'x', no: 1, date: '2026-10-01', baseUpdatedAt: 't0', conflict, entry: {} }] }] }],
      orphans: [{ classId: 'c', className: 'Lớp 2', studentId: 's', studentName: 'A', reason: 'studentRemoved', removedAt: 'now', sessions: [{ id: 'y', no: 2, date: '2026-10-02', dirty: true, entry: { attendance: 'absent' } }] }],
    })
    expect(d.classes[0].students[0].sessions[0]).toMatchObject({ baseUpdatedAt: 't0', conflict })
    expect(d.orphans?.[0].sessions[0]).toMatchObject({ id: 'y', dirty: true })
    expect(d.orphans?.[0].sessions[0].entry.attendance).toBe('absent')
  })
})

const MONGOID_A = 'a'.repeat(24)
const MONGOID_B = 'b'.repeat(24)
const MONGOID_C = 'c'.repeat(24)
const LOCAL_ONLY = 'local-123'

describe('pruneGoneFromServer', () => {
  it('giữ nguyên bản ghi đã đồng bộ còn được server liệt kê', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A, MONGOID_B]))
    expect(result).toEqual(local)
  })

  it('gỡ bản ghi đã đồng bộ nhưng server không còn liệt kê (VD: bị gộp/chuyển lớp)', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A]))
    expect(result).toEqual([{ id: MONGOID_A }])
  })

  it('KHÔNG đụng bản ghi local-only (chưa đồng bộ lên server)', () => {
    const local = [{ id: LOCAL_ONLY }, { id: MONGOID_A }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A]))
    expect(result).toEqual(local)
  })

  it('server rỗng (chưa tải xong hoặc thật sự không còn gì) vẫn giữ local-only, gỡ hết bản ghi đã đồng bộ', () => {
    const local = [{ id: LOCAL_ONLY }, { id: MONGOID_A }, { id: MONGOID_B }]
    const result = pruneGoneFromServer(local, new Set())
    expect(result).toEqual([{ id: LOCAL_ONLY }])
  })

  it('không có gì để gỡ khi tất cả đã đồng bộ và server liệt kê đủ', () => {
    const local = [{ id: MONGOID_A }, { id: MONGOID_B }, { id: MONGOID_C }]
    const result = pruneGoneFromServer(local, new Set([MONGOID_A, MONGOID_B, MONGOID_C]))
    expect(result).toHaveLength(3)
  })

  it('mảng rỗng trả về mảng rỗng', () => {
    expect(pruneGoneFromServer([], new Set())).toEqual([])
  })
})

describe('resolvePlausibleNo', () => {
  it('khớp đúng 1 buổi đã có sẵn thì giữ nguyên', () => {
    expect(resolvePlausibleNo(5, [1, 2, 3, 4, 5], 12)).toBe(5)
  })

  it('cho phép buổi KẾ TIẾP chưa tạo (VD vừa chọn "Tháng 2") — bug thật đã gặp: trước đây bị validate rớt, tự nhảy về Tháng 1', () => {
    // Học sinh đang có 12 buổi (1..12), vừa chọn Tháng 2 → buổi 13 (chưa tạo)
    expect(resolvePlausibleNo(13, Array.from({ length: 12 }, (_, i) => i + 1), 12)).toBe(13)
  })

  it('cho phép buổi kế tiếp xa hơn 1 bậc nếu cả lớp đã chạm mốc đó (classWideMaxNo)', () => {
    // Em này mới có 5 buổi, nhưng cả lớp đã có bạn tới buổi 20 — chọn Tháng 2 (buổi 13) vẫn hợp lệ
    expect(resolvePlausibleNo(13, [1, 2, 3, 4, 5], 20)).toBe(13)
  })

  it('gỡ số RÁC bị kẹt từ trước (VD "1014" ở Lớp 7) — vượt xa mốc hợp lý', () => {
    expect(resolvePlausibleNo(1014, [1, 2, 3, 4, 5], 12)).toBeNull()
  })

  it('không có số lưu sẵn (chưa từng mở học sinh này) trả về null', () => {
    expect(resolvePlausibleNo(undefined, [1, 2, 3], 12)).toBeNull()
    expect(resolvePlausibleNo(null, [1, 2, 3], 12)).toBeNull()
  })

  it('số 0 hoặc âm luôn là rác dù trong mốc hợp lý', () => {
    expect(resolvePlausibleNo(0, [], 12)).toBeNull()
    expect(resolvePlausibleNo(-1, [], 12)).toBeNull()
  })

  it('học sinh chưa có buổi nào, chọn buổi 1 (kế tiếp) vẫn hợp lệ', () => {
    expect(resolvePlausibleNo(1, [], 8)).toBe(1)
  })
})

// ─── syncStudentsFromServer ────────────────────────────────────────────────
const STU = 'f'.repeat(24)
const SV1 = '1'.repeat(24)
const SV2 = '2'.repeat(24)

function sess(over: Partial<Session>): Session {
  return { id: SV1, no: 1, date: '2026-10-10', homework: '', entry: emptyEntry(), ...over }
}
function serverSess(over: Partial<ServerSessionForSync> = {}): ServerSessionForSync {
  return { _id: SV1, studentId: STU, scheduledAt: '2026-10-10T00:00:00.000Z', lessonNo: 1, notes: '', ...over }
}
function serverScore(over: Partial<ServerScoreForSync> = {}): ServerScoreForSync {
  return { ...emptyEntry(), sessionId: SV1, scores: { mini: 8 }, ev: {}, ...over }
}
const run = (sessions: Session[], server: ServerSessionForSync[], scores: ServerScoreForSync[] = []) => {
  const students = [{ id: STU, sessions }]
  const changed = syncStudentsFromServer(students, server, new Map(scores.map((s) => [s.sessionId, s])))
  return { changed, sessions: students[0].sessions }
}

describe('syncStudentsFromServer', () => {
  it('máy A sửa điểm → máy B (bản sao đã đồng bộ, không sửa gì) được LÀM MỚI theo server — sự cố "1 tài khoản 2 máy 2 dữ liệu"', () => {
    const { sessions } = run(
      [sess({ synced: true, entry: { ...emptyEntry(), scores: { mini: 5 } } })],
      [serverSess()], [serverScore({ scores: { mini: 9 } })],
    )
    expect(sessions[0].entry.scores).toEqual({ mini: 9 })
  })

  it('máy đang sửa dở (dirty) → KHÔNG bị server ghi đè ngược, kể cả bài tập về nhà đang gõ', () => {
    const { sessions } = run(
      [sess({ synced: true, dirty: true, homework: 'Unit 3 trang 12', entry: { ...emptyEntry(), scores: { mini: 5 } } })],
      [serverSess({ notes: '' })], [serverScore({ scores: { mini: 9 } })],
    )
    expect(sessions[0].entry.scores).toEqual({ mini: 5 })
    expect(sessions[0].homework).toBe('Unit 3 trang 12')
  })

  it('dữ liệu CŨ (chưa có cờ synced) khác server → giữ nguyên, không đoán bản nào đúng', () => {
    const { sessions } = run(
      [sess({ entry: { ...emptyEntry(), scores: { mini: 5 } } })],
      [serverSess()], [serverScore({ scores: { mini: 9 } })],
    )
    expect(sessions[0].entry.scores).toEqual({ mini: 5 })
    expect(sessions[0].synced).toBeUndefined()
  })

  it('dữ liệu cũ trùng khớp server → đánh dấu synced (từ đó mới được làm mới tự động)', () => {
    const { sessions } = run(
      [sess({ entry: { ...emptyEntry(), scores: { mini: '8' } } })],
      [serverSess()], [serverScore({ scores: { mini: 8 } })],
    )
    expect(sessions[0].synced).toBe(true)
  })

  it('dữ liệu cũ: bài tập về nhà theo server (hành vi cũ giữ nguyên — admin sửa bài tập thì máy giáo viên thấy)', () => {
    const { sessions } = run([sess({ homework: 'cũ' })], [serverSess({ notes: 'Unit 5' })])
    expect(sessions[0].homework).toBe('Unit 5')
  })

  it('dữ liệu cũ còn trống → điền từ server (hành vi cũ giữ nguyên)', () => {
    const { sessions } = run([sess({})], [serverSess()], [serverScore()])
    expect(sessions[0].entry.scores).toEqual({ mini: 8 })
  })

  it('số buổi / ngày / đã thu tiền luôn theo server — kể cả khi máy đang dirty (admin xếp lại số, đánh dấu đã thu)', () => {
    const { sessions } = run(
      [sess({ no: 9, date: '2026-10-11', dirty: true })],
      [serverSess({ lessonNo: 12, billed: true })],
    )
    expect(sessions[0]).toMatchObject({ no: 12, date: '2026-10-10', billed: true })
  })

  it('"Số câu" (maxes) đồng bộ giữa các máy — trước đây chỉ nằm trên 1 máy, máy khác tính % sai', () => {
    const { sessions } = run([sess({ synced: true })], [serverSess({ maxes: { mini: 30 } })], [serverScore()])
    expect(sessions[0].maxes).toEqual({ mini: 30 })
  })

  it('buổi server có mà máy chưa có → thêm, mang theo số câu + đánh dấu synced', () => {
    const { sessions } = run([], [serverSess({ _id: SV2, maxes: { listen: 20 } })], [serverScore({ sessionId: SV2 })])
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ id: SV2, maxes: { listen: 20 }, synced: true })
  })

  it('buổi đã đồng bộ mà server không còn → gỡ (bị xóa/chuyển lớp)', () => {
    const { sessions } = run([sess({ synced: true })], [])
    expect(sessions).toHaveLength(0)
  })

  it('buổi server không còn NHƯNG máy đang dirty → GIỮ (danh sách server có thể là cache cũ chưa có buổi vừa tạo — gỡ là mất sửa đổi)', () => {
    const { sessions } = run([sess({ synced: true, dirty: true })], [])
    expect(sessions).toHaveLength(1)
  })

  it('buổi id tạm (chưa lên server) không bao giờ bị đụng', () => {
    const temp = sess({ id: 'local-1', entry: { ...emptyEntry(), scores: { mini: 3 } } })
    const { sessions } = run([temp], [serverSess()], [serverScore()])
    expect(sessions.find((s) => s.id === 'local-1')?.entry.scores).toEqual({ mini: 3 })
  })

  it('không có gì khác → báo không đổi (không ghi lại dữ liệu vô ích)', () => {
    const { changed } = run(
      [sess({ synced: true, entry: { ...emptyEntry(), scores: { mini: 8 } } })],
      [serverSess()], [serverScore()],
    )
    expect(changed).toBe(false)
  })

  it('nhận xét sửa ở máy khác cũng được làm mới (so cả nhận xét, không chỉ điểm số)', () => {
    const { sessions } = run(
      [sess({ synced: true, entry: { ...emptyEntry(), scores: { mini: 8 }, note: 'cũ' } })],
      [serverSess()], [serverScore({ note: 'mới' })],
    )
    expect(sessions[0].entry.note).toBe('mới')
  })
})

describe('adoptServerSession', () => {
  it('máy chưa có bản của buổi server → đổi id bản tạm thành id server, giữ nguyên dữ liệu', () => {
    const entry = { ...emptyEntry(), scores: { mini: 7 } }
    const student = { sessions: [sess({ id: 'local-1', no: 3, dirty: true, entry })] }
    adoptServerSession(student, 'local-1', SV2, 13, { entry, homework: '' })
    expect(student.sessions).toHaveLength(1)
    expect(student.sessions[0]).toMatchObject({ id: SV2, no: 13, dirty: false, synced: true })
    expect(student.sessions[0].entry.scores).toEqual({ mini: 7 })
  })

  it('mới TẠO buổi (điểm chưa gửi xong) → đổi id nhưng GIỮ dirty — gửi điểm lỗi thì lần sau còn gửi lại', () => {
    const student = { sessions: [sess({ id: 'local-1', dirty: true, entry: { ...emptyEntry(), scores: { mini: 7 } } })] }
    adoptServerSession(student, 'local-1', SV2, 13)
    expect(student.sessions[0]).toMatchObject({ id: SV2, dirty: true })
    expect(student.sessions[0].synced).toBeUndefined()
  })

  it('máy đã có bản server mà còn TRỐNG → chuyển dữ liệu bản tạm vào, rồi mới bỏ bản tạm (không mất gì)', () => {
    const student = { sessions: [
      sess({ id: SV2, entry: emptyEntry() }),
      sess({ id: 'local-1', homework: 'Unit 4', entry: { ...emptyEntry(), scores: { mini: 7 } } }),
    ] }
    adoptServerSession(student, 'local-1', SV2)
    expect(student.sessions).toHaveLength(1)
    expect(student.sessions[0].entry.scores).toEqual({ mini: 7 })
    expect(student.sessions[0].homework).toBe('Unit 4')
  })

  it('máy đã có bản server CÓ dữ liệu → giữ bản đó, không ghi đè bằng bản tạm', () => {
    const student = { sessions: [
      sess({ id: SV2, entry: { ...emptyEntry(), scores: { mini: 9 } } }),
      sess({ id: 'local-1', entry: { ...emptyEntry(), scores: { mini: 7 } } }),
    ] }
    adoptServerSession(student, 'local-1', SV2)
    expect(student.sessions).toHaveLength(1)
    expect(student.sessions[0].entry.scores).toEqual({ mini: 9 })
  })
})

describe('markSessionSaved / adopt khi giáo viên gõ thêm trong lúc đang gửi', () => {
  const sentEntry = { ...emptyEntry(), scores: { mini: 7 } }

  it('nội dung trên máy vẫn đúng bản đã gửi → hết dirty, synced', () => {
    const student = { sessions: [sess({ dirty: true, entry: { ...emptyEntry(), scores: { mini: '7' } } })] }
    markSessionSaved(student, SV1, { entry: sentEntry, homework: '' })
    expect(student.sessions[0]).toMatchObject({ dirty: false, synced: true })
  })

  it('đã gõ thêm sau khi gửi → VẪN dirty (phần gõ thêm chưa lên server, không được coi là đã lưu)', () => {
    const student = { sessions: [sess({ dirty: true, entry: { ...emptyEntry(), scores: { mini: 7, listen: 4 } } })] }
    markSessionSaved(student, SV1, { entry: sentEntry, homework: '' })
    expect(student.sessions[0].dirty).toBe(true)
  })

  it('bài tập về nhà sửa thêm sau khi gửi → vẫn dirty', () => {
    const student = { sessions: [sess({ dirty: true, homework: 'mới', entry: sentEntry })] }
    markSessionSaved(student, SV1, { entry: sentEntry, homework: 'cũ' })
    expect(student.sessions[0].dirty).toBe(true)
  })

  it('buổi mới: id tạm → id server, gõ thêm trong lúc tạo → giữ dirty', () => {
    const student = { sessions: [sess({ id: 'local-1', dirty: true, entry: { ...emptyEntry(), scores: { mini: 7, listen: 2 } } })] }
    adoptServerSession(student, 'local-1', SV2, 5, { entry: sentEntry, homework: '' })
    expect(student.sessions[0]).toMatchObject({ id: SV2, no: 5, dirty: true, synced: true })
  })
})

describe('2 máy cùng sửa 1 buổi (baseUpdatedAt / conflict)', () => {
  const T0 = '2026-10-20T10:00:00.000Z'
  const T1 = '2026-10-20T10:05:00.000Z'

  it('đồng bộ ghi lại mốc bản server máy đang dựa vào', () => {
    const { sessions } = run([sess({ synced: true })], [serverSess()], [serverScore({ updatedAt: T0 })])
    expect(sessions[0].baseUpdatedAt).toBe(T0)
  })

  it('máy đang sửa dở → GIỮ mốc cũ (để server phát hiện máy khác lưu chen vào)', () => {
    const { sessions } = run([sess({ synced: true, dirty: true, baseUpdatedAt: T0 })], [serverSess()], [serverScore({ updatedAt: T1 })])
    expect(sessions[0].baseUpdatedAt).toBe(T0)
  })

  it('lưu xong → mốc = thời điểm server trả về, hết xung đột', () => {
    const entry = { ...emptyEntry(), scores: { mini: 7 } }
    const student = { sessions: [sess({ dirty: true, entry, baseUpdatedAt: T0, conflict: { entry, total: 1, updatedAt: T0 } })] }
    markSessionSaved(student, SV1, { entry, homework: '' }, T1)
    expect(student.sessions[0]).toMatchObject({ baseUpdatedAt: T1, dirty: false })
    expect(student.sessions[0].conflict).toBeUndefined()
  })

  it('bị từ chối vì máy khác lưu bản mới hơn → giữ cả 2 bản, bộ tự lưu KHÔNG tự gửi lại (không tự đè)', () => {
    const student = { id: STU, sessions: [sess({ dirty: true, entry: { ...emptyEntry(), scores: { mini: 5 } } })] }
    markConflict(student, SV1, { entry: { ...emptyEntry(), scores: { mini: 9 } }, total: 80, updatedAt: T1, byName: 'cô Thương' })
    expect(student.sessions[0].entry.scores).toEqual({ mini: 5 })
    expect(student.sessions[0].conflict?.byName).toBe('cô Thương')
    expect(pendingSessionsOf([student])).toEqual([])
  })

  it('chọn "Dùng bản máy kia" → lấy bản kia, hết dirty, mốc = bản kia', () => {
    const student = { sessions: [sess({ dirty: true, entry: { ...emptyEntry(), scores: { mini: 5 } }, conflict: { entry: { ...emptyEntry(), scores: { mini: 9 } }, total: 80, updatedAt: T1 } })] }
    resolveConflict(student, SV1, 'theirs')
    expect(student.sessions[0]).toMatchObject({ dirty: false, synced: true, baseUpdatedAt: T1 })
    expect(student.sessions[0].entry.scores).toEqual({ mini: 9 })
  })

  it('chọn "Giữ bản của tôi" → giữ bản máy này, vẫn dirty, mốc = bản kia (lần lưu tới được ghi đè có chủ đích)', () => {
    const student = { id: STU, sessions: [sess({ dirty: true, entry: { ...emptyEntry(), scores: { mini: 5 } }, conflict: { entry: emptyEntry(), total: 0, updatedAt: T1 } })] }
    resolveConflict(student, SV1, 'mine')
    expect(student.sessions[0]).toMatchObject({ dirty: true, baseUpdatedAt: T1 })
    expect(student.sessions[0].entry.scores).toEqual({ mini: 5 })
    expect(pendingSessionsOf([student])).toHaveLength(1)
  })
})

describe('collectOrphans (học sinh/lớp bị gỡ khỏi máy khi còn dữ liệu chưa lên server)', () => {
  const cls = {
    id: 'c'.repeat(24), name: 'Lớp 2',
    students: [
      { id: STU, name: 'Linh Đan', sessions: [
        sess({ id: SV1, synced: true }),                                   // đã lên server, không sửa → không giữ
        sess({ id: SV2, dirty: true }),                                     // sửa chưa lên → GIỮ
        sess({ id: 'local-1', entry: { ...emptyEntry(), scores: { mini: 6 } } }), // chưa từng lên, có điểm → GIỮ
        sess({ id: 'local-2' }),                                            // chưa lên nhưng trống → không giữ
        sess({ id: 'local-3', entry: { ...emptyEntry(), attendance: 'excused' } }), // chỉ có vắng phép → GIỮ
      ] },
      { id: 'e'.repeat(24), name: 'Việt An', sessions: [sess({ id: SV1, synced: true })] },
    ],
  }

  it('học sinh bị gỡ: giữ ĐÚNG các buổi chưa lên server, kèm lớp/tên để admin biết của ai', () => {
    const [o, ...rest] = collectOrphans(cls, new Set([STU]), 'studentRemoved', 'now')
    expect(rest).toHaveLength(0)
    expect(o).toMatchObject({ className: 'Lớp 2', studentName: 'Linh Đan', reason: 'studentRemoved' })
    expect(o.sessions.map((s) => s.id)).toEqual([SV2, 'local-1', 'local-3'])
  })

  it('học sinh không có gì chưa lên → không tạo bản ghi', () => {
    expect(collectOrphans(cls, new Set(['e'.repeat(24)]), 'studentRemoved')).toEqual([])
  })

  it('cả lớp bị gỡ → gom của mọi học sinh trong lớp', () => {
    expect(collectOrphans(cls, 'all', 'classRemoved')).toHaveLength(1)
  })

  it('thêm vào kho 2 lần (hiệu ứng chạy lại) → KHÔNG trùng; buổi mới của cùng học sinh thì gộp vào', () => {
    const first = collectOrphans(cls, new Set([STU]), 'studentRemoved', 'now')
    const twice = appendOrphans(appendOrphans([], first), first)
    expect(twice).toHaveLength(1)
    expect(twice[0].sessions).toHaveLength(3)
    const more = appendOrphans(twice, [{ ...first[0], sessions: [sess({ id: 'local-9', dirty: true })] }])
    expect(more[0].sessions.map((s) => s.id)).toContain('local-9')
    expect(more[0].sessions).toHaveLength(4)
  })
})

describe('sameDateClash (chặn tạo buổi mới trùng ngày — sự cố Mina 17/18/10)', () => {
  const student = { sessions: [sess({ id: SV1, no: 9, date: '2026-10-17' })] }
  it('tạo Buổi 10 mà ô ngày còn để 17/10 (đã có Buổi 9 ngày 17/10) → CHẶN, chỉ ra buổi trùng', () => {
    expect(sameDateClash(student, 10, '2026-10-17')?.no).toBe(9)
  })
  it('tạo Buổi 10 ngày 18/10 → cho tạo', () => {
    expect(sameDateClash(student, 10, '2026-10-18')).toBeNull()
  })
  it('đang SỬA buổi đã có (Buổi 9) → không chặn', () => {
    expect(sameDateClash(student, 9, '2026-10-17')).toBeNull()
  })
})

describe('pendingSessionsOf', () => {
  it('chỉ lấy buổi dirty của học sinh đã lên server', () => {
    const out = pendingSessionsOf([
      { id: STU, sessions: [sess({ dirty: true }), sess({ id: SV2 })] },
      { id: 'local-st', sessions: [sess({ id: 'x', dirty: true })] },
    ])
    expect(out).toEqual([{ studentId: STU, sessionId: SV1 }])
  })
})
