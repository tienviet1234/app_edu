import { describe, it, expect } from 'vitest'
import { classifyScoreJobs, collectScoreJobs, type ScoreJob } from './strandedScores'
import { normalize, emptyEntry } from './seed'

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
    entry: { ...emptyEntry(), scores: { mini: 10 } }, total: 60, homework: '', needsCreate: true,
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
