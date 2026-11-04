import { describe, it, expect } from 'vitest'
import { classifyScoreJobs, collectScoreJobs, dayRecoveryRows, jobIsCurrent, type ClassifiedJob, type ScoreJob } from './strandedScores'
import { normalize, emptyEntry } from './seed'
import type { Session } from '@/types'

describe('jobIsCurrent (đồng bộ nền không gửi bản đã cũ)', () => {
  const entry = { ...emptyEntry(), scores: { mini: 10 } }
  const session = (over: Partial<Session> = {}): Session => ({ id: 's', no: 1, date: '2026-11-02', entry, dirty: true, homework: 'Trang 1', baseUpdatedAt: 'T1', ...over })
  const queued = {
    classId: 'c', className: 'Lớp 7', studentId: 'st', studentName: 'An', sessionLocalId: 's', no: 1, date: '2026-11-02',
    entry, total: 60, homework: 'Trang 1', needsCreate: false, dirty: true, baseUpdatedAt: 'T1',
  } satisfies ScoreJob

  it('buổi không đổi từ lúc gom → gửi', () => {
    expect(jobIsCurrent(queued, session())).toBe(true)
  })
  it('giáo viên sửa điểm trong lúc vòng đồng bộ đang chạy → bỏ qua, không gửi bản cũ', () => {
    expect(jobIsCurrent(queued, session({ entry: { ...entry, scores: { mini: 20 } } }))).toBe(false)
  })
  it('giáo viên vừa nhập bài tập → bỏ qua, không đè bằng bài tập cũ', () => {
    expect(jobIsCurrent(queued, session({ homework: 'Trang 2' }))).toBe(false)
  })
  it('đổi số câu → bỏ qua', () => {
    expect(jobIsCurrent(queued, session({ maxes: { mini: 30 } }))).toBe(false)
  })
  it('Nhập điểm đã lưu xong (mốc mới, hết dirty) → bỏ qua: gửi mốc cũ là xung đột giả', () => {
    expect(jobIsCurrent(queued, session({ baseUpdatedAt: 'T2' }))).toBe(false)
    expect(jobIsCurrent(queued, session({ dirty: false }))).toBe(false)
  })
  it('buổi đã có xung đột cần giáo viên chọn → bỏ qua', () => {
    expect(jobIsCurrent(queued, session({ conflict: { entry, total: 1, updatedAt: 'T2' } } as Partial<Session>))).toBe(false)
  })
  it('buổi đã đổi id (vừa được tạo trên server) hoặc đã xóa → bỏ qua, không tạo trùng', () => {
    expect(jobIsCurrent(queued, null)).toBe(false)
    expect(jobIsCurrent(queued, undefined)).toBe(false)
  })
})

describe('dayRecoveryRows (kết luận từng em khi tìm 1 lớp + 1 ngày)', () => {
  const A = 'a'.repeat(24), B = 'b'.repeat(24), C = 'c'.repeat(24), D = 'd'.repeat(24)
  const roster = [{ id: A, name: 'An' }, { id: B, name: 'Bình' }, { id: C, name: 'Châu' }]
  const found = (studentId: string, kind: ClassifiedJob['kind'], over: Partial<ScoreJob> = {}, device = 'm1') => ({
    classId: 'c', className: 'Lớp 7', studentId, studentName: 'Em ' + studentId[0], sessionLocalId: 'tmp', no: 1, date: '2026-10-29',
    entry: { ...emptyEntry(), scores: { mini: 10 } }, total: 60, homework: '', needsCreate: true, dirty: false, kind, sources: [device], ...over,
  })

  it('ca thật 29/10: em có trên server / em tìm thấy / em không có ở đâu', () => {
    const rows = dayRecoveryRows(roster, [found(B, 'create')], new Set([A]))
    expect(rows.map((r) => [r.studentName, r.status])).toEqual([['An', 'onServer'], ['Bình', 'recoverable'], ['Châu', 'none']])
  })
  it('bản giống hệt trên 2 máy gộp làm 1, nguồn cộng dồn; bản khác nội dung giữ riêng', () => {
    const rows = dayRecoveryRows(roster, [found(B, 'create', {}, 'm1'), found(B, 'create', {}, 'm2'), found(B, 'create', { entry: { ...emptyEntry(), scores: { mini: 5 } } }, 'm3')], new Set())
    const b = rows.find((r) => r.studentId === B)!
    expect(b.versions).toHaveLength(2)
    expect(b.versions[0].sources).toEqual(['m1', 'm2'])
  })
  it('bài tập về nhà khác nhau là 2 bản khác nhau', () => {
    const rows = dayRecoveryRows(roster, [found(B, 'create'), found(B, 'create', { homework: 'Trang 43' })], new Set())
    expect(rows.find((r) => r.studentId === B)!.versions).toHaveLength(2)
  })
  it('đã có trên server: bản khác vẫn hiện để xem nhưng em không tính là "đưa lên được"; bản y hệt server bỏ đi', () => {
    const rows = dayRecoveryRows(roster, [found(A, 'conflict'), found(A, 'already', { homework: 'x' })], new Set([A]))
    const a = rows.find((r) => r.studentId === A)!
    expect(a.status).toBe('onServer')
    expect(a.versions.map((v) => v.kind)).toEqual(['conflict'])
  })
  it('chỉ có bản thuộc buổi đã xóa → "deleted", không phải "none"', () => {
    expect(dayRecoveryRows(roster, [found(C, 'deletedOnServer')], new Set()).find((r) => r.studentId === C)!.status).toBe('deleted')
  })
  it('em không còn trong lớp vẫn được liệt kê, không giấu dữ liệu tìm được', () => {
    const rows = dayRecoveryRows(roster, [found(D, 'notInClass')], new Set())
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatchObject({ studentId: D, status: 'none' })
    expect(rows[3].versions).toHaveLength(1)
  })
})

const CLS = 'c'.repeat(24)
const STU = 'a'.repeat(24)
const STU2 = 'b'.repeat(24)
const S1 = '1'.repeat(24)
const S2 = '2'.repeat(24)
const S3 = '3'.repeat(24)

function job(over: Partial<ScoreJob>): ScoreJob {
  return {
    classId: CLS, className: 'Lớp 10', studentId: STU, studentName: 'Thịnh',
    sessionLocalId: 'local-1', no: 13, date: '2026-10-17',
    entry: { ...emptyEntry(), scores: { mini: 10 } }, total: 60, homework: '', needsCreate: true, dirty: false,
    ...over,
  }
}

describe('collectScoreJobs', () => {
  const data = normalize({
    classes: [
      {
        id: CLS, name: 'Lớp 10', level: 'secondary', students: [
          { id: STU, name: 'Thịnh', sessions: [
            { id: S1, no: 1, date: '2026-10-10', entry: { attendance: 'present', scores: { mini: 20 } } },
            { id: 'local-x', no: 2, date: '2026-10-13', entry: { attendance: 'present', scores: { listen: 10 } } },
            { id: 'local-empty', no: 3, date: '2026-10-15', entry: { attendance: 'present' } },
            { id: 'local-excused', no: 4, date: '2026-10-17', entry: { attendance: 'excused' } },
          ] },
          { id: 'local-student', name: 'Chưa đồng bộ', sessions: [
            { id: 'local-y', no: 1, date: '2026-10-10', entry: { attendance: 'present', scores: { mini: 5 } } },
          ] },
        ],
      },
      { id: 'local-class', name: 'Lớp nháp', level: 'secondary', students: [
        { id: STU2, name: 'X', sessions: [{ id: 'local-z', no: 1, date: '2026-10-10', entry: { attendance: 'present', scores: { mini: 5 } } }] },
      ] },
    ],
  })

  const jobs = collectScoreJobs(data.classes)

  it('lấy buổi đã chấm (cả id server lẫn id tạm), đánh dấu đúng needsCreate', () => {
    expect(jobs.find((j) => j.sessionLocalId === S1)?.needsCreate).toBe(false)
    expect(jobs.find((j) => j.sessionLocalId === 'local-x')?.needsCreate).toBe(true)
  })

  it('bỏ buổi trống (chưa nhập gì)', () => {
    expect(jobs.some((j) => j.sessionLocalId === 'local-empty')).toBe(false)
  })

  it('GIỮ buổi chỉ có điểm danh "vắng phép" (trước đây bị bỏ sót, kẹt mãi trên máy)', () => {
    const j = jobs.find((x) => x.sessionLocalId === 'local-excused')
    expect(j).toBeDefined()
    expect(j?.total).toBe(0)
  })

  it('bỏ học sinh / lớp còn id tạm (chưa lên server)', () => {
    expect(jobs.some((j) => j.sessionLocalId === 'local-y' || j.sessionLocalId === 'local-z')).toBe(false)
  })
})

describe('classifyScoreJobs', () => {
  it('buổi id tạm, server chưa có buổi ngày đó → create', () => {
    const [r] = classifyScoreJobs([job({})], [], [])
    expect(r.kind).toBe('create')
  })

  it('buổi id tạm, server ĐÃ có buổi cùng ngày nhưng chưa có điểm → fillExisting vào đúng buổi đó', () => {
    const [r] = classifyScoreJobs([job({})], [{ _id: S2, studentId: STU, scheduledAt: '2026-10-17T00:00:00.000Z' }], [])
    expect(r.kind).toBe('fillExisting')
    expect(r.targetSessionId).toBe(S2)
  })

  it('buổi cùng ngày nhưng của học sinh KHÁC → vẫn create (không nhầm học sinh)', () => {
    const [r] = classifyScoreJobs([job({})], [{ _id: S2, studentId: STU2, scheduledAt: '2026-10-17T00:00:00.000Z' }], [])
    expect(r.kind).toBe('create')
  })

  it('server đã có điểm CÙNG NỘI DUNG → already (kể cả "10" vs 10, tổng khác do rubric đổi)', () => {
    const [r] = classifyScoreJobs(
      [job({ entry: { ...emptyEntry(), scores: { mini: '10', listen: '' }, ticks: { hw: ['b', 'a'] } } })],
      [{ _id: S2, studentId: STU, scheduledAt: '2026-10-17T00:00:00.000Z' }],
      [{ sessionId: S2, studentId: STU, total: 55, attendance: 'present', scores: { mini: 10 }, ticks: { hw: ['a', 'b'] } }],
    )
    expect(r.kind).toBe('already')
  })

  it('server đã có điểm KHÁC → conflict, KHÔNG ghi đè, kèm điểm server để đối chiếu', () => {
    const [r] = classifyScoreJobs(
      [job({ needsCreate: false, sessionLocalId: S3 })],
      [{ _id: S3, studentId: STU, scheduledAt: '2026-10-17T00:00:00.000Z' }],
      [{ sessionId: S3, studentId: STU, total: 75, attendance: 'present', scores: { mini: 15 } }],
    )
    expect(r.kind).toBe('conflict')
    expect(r.serverTotal).toBe(75)
  })

  it('điểm danh khác (máy: vắng, server: có mặt) → conflict', () => {
    const [r] = classifyScoreJobs(
      [job({ needsCreate: false, sessionLocalId: S3, total: 0, entry: { ...emptyEntry(), attendance: 'absent' } })],
      [{ _id: S3, studentId: STU, scheduledAt: '2026-10-17T00:00:00.000Z' }],
      [{ sessionId: S3, studentId: STU, total: 0, attendance: 'present' }],
    )
    expect(r.kind).toBe('conflict')
  })

  it('buổi id server, server có buổi nhưng chưa có điểm → fill (sự cố "tạo buổi được nhưng gửi điểm lỗi")', () => {
    const [r] = classifyScoreJobs(
      [job({ needsCreate: false, sessionLocalId: S3 })],
      [{ _id: S3, studentId: STU, scheduledAt: '2026-10-17T00:00:00.000Z' }],
      [],
    )
    expect(r.kind).toBe('fill')
    expect(r.targetSessionId).toBe(S3)
  })

  it('học sinh không còn trong lớp (đã gộp/chuyển) → notInClass, KHÔNG tạo lại buổi', () => {
    const roster = new Map([[CLS, new Set([STU2])]])
    const [r] = classifyScoreJobs([job({})], [], [], roster)
    expect(r.kind).toBe('notInClass')
  })

  it('lớp không còn trên server → notInClass', () => {
    const [r] = classifyScoreJobs([job({})], [], [], new Map())
    expect(r.kind).toBe('notInClass')
  })

  it('học sinh còn trong lớp → xét bình thường', () => {
    const [r] = classifyScoreJobs([job({})], [], [], new Map([[CLS, new Set([STU])]]))
    expect(r.kind).toBe('create')
  })

  it('buổi id server nhưng server đã xóa buổi đó → deletedOnServer, không tự hồi sinh', () => {
    const [r] = classifyScoreJobs([job({ needsCreate: false, sessionLocalId: S3 })], [], [])
    expect(r.kind).toBe('deletedOnServer')
  })
})
