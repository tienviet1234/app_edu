import { describe, it, expect } from 'vitest'
import {
  pruneGoneFromServer, resolvePlausibleNo, syncStudentsFromServer, adoptServerSession, pendingSessionsOf, markSessionSaved,
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

describe('pendingSessionsOf', () => {
  it('chỉ lấy buổi dirty của học sinh đã lên server', () => {
    const out = pendingSessionsOf([
      { id: STU, sessions: [sess({ dirty: true }), sess({ id: SV2 })] },
      { id: 'local-st', sessions: [sess({ id: 'x', dirty: true })] },
    ])
    expect(out).toEqual([{ studentId: STU, sessionId: SV1 }])
  })
})
