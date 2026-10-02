import fs from 'node:fs'
import path from 'node:path'
import mongoose, { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { Attendance } from '../models/Attendance.js'
import { Class } from '../models/Class.js'
import { Migration } from '../models/Migration.js'

export const SESSION_MIGRATION_KEY = 'sessions-per-student-v1'

export interface ClassMigrationSummary {
  classId: string
  className: string
  sharedSessionsFound: number
  newDocsCreated: number
  scoresRepointed: number
  attendanceRepointed: number
}

/** Danh sách lớp còn "buổi chung" (studentId chưa gắn) chưa được chuyển sang
 *  cấu trúc mới — dùng cho cả xem-trước (preview) lẫn chạy thật. */
async function classIdsPending(classId?: string): Promise<Types.ObjectId[]> {
  if (classId) return [new Types.ObjectId(classId)]
  return (await ClassSession.distinct('classId', {
    studentId: { $exists: false }, migratedAt: { $exists: false },
  })) as Types.ObjectId[]
}

/** Xem trước (KHÔNG ghi gì) — đếm sẽ fan-out ra bao nhiêu buổi riêng, dùng để
 *  admin xem số liệu trước khi quyết định chạy thật. An toàn tuyệt đối. */
export async function previewSessionMigration(classId?: string): Promise<ClassMigrationSummary[]> {
  const classIds = await classIdsPending(classId)
  const summaries: ClassMigrationSummary[] = []
  for (const cid of classIds) {
    const cls = await Class.findById(cid, 'name studentIds').lean()
    const sharedSessions = await ClassSession.find({
      classId: cid, studentId: { $exists: false }, migratedAt: { $exists: false },
    }, '_id').lean()
    if (!sharedSessions.length) continue

    let newDocsCreated = 0
    for (const shared of sharedSessions) {
      const [scoreStudentIds, attendStudentIds] = await Promise.all([
        Score.find({ sessionId: shared._id }, 'studentId').lean(),
        Attendance.find({ sessionId: shared._id }, 'studentId').lean(),
      ])
      let studentIds = [...new Set([...scoreStudentIds, ...attendStudentIds].map((x) => String(x.studentId)))]
      if (!studentIds.length) studentIds = (cls?.studentIds ?? []).map((id) => String(id))
      newDocsCreated += studentIds.length
    }
    summaries.push({
      classId: String(cid),
      className: cls?.name ?? String(cid),
      sharedSessionsFound: sharedSessions.length,
      newDocsCreated,
      scoresRepointed: 0,
      attendanceRepointed: 0,
    })
  }
  return summaries
}

async function migrateOneClass(classId: Types.ObjectId): Promise<ClassMigrationSummary> {
  const cls = await Class.findById(classId, 'name studentIds').lean()
  const className = cls?.name ?? String(classId)

  const sharedSessions = await ClassSession.find({
    classId, studentId: { $exists: false }, migratedAt: { $exists: false },
  }).sort({ scheduledAt: 1 })

  const summary: ClassMigrationSummary = {
    classId: String(classId), className, sharedSessionsFound: sharedSessions.length,
    newDocsCreated: 0, scoresRepointed: 0, attendanceRepointed: 0,
  }
  if (!sharedSessions.length) return summary

  const lessonNoCounter = new Map<string, number>()
  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      for (const shared of sharedSessions) {
        const [scoreStudentIds, attendStudentIds] = await Promise.all([
          Score.find({ sessionId: shared._id }, 'studentId').session(mongoSession).lean(),
          Attendance.find({ sessionId: shared._id }, 'studentId').session(mongoSession).lean(),
        ])
        let studentIds = [...new Set([...scoreStudentIds, ...attendStudentIds].map((x) => String(x.studentId)))]
        if (!studentIds.length) studentIds = (cls?.studentIds ?? []).map((id) => String(id))

        for (const sidStr of studentIds) {
          const key = `${classId}:${sidStr}`
          const lessonNo = (lessonNoCounter.get(key) ?? 0) + 1
          lessonNoCounter.set(key, lessonNo)

          const [newDoc] = await ClassSession.create(
            [{
              classId: shared.classId, centerId: shared.centerId, courseId: shared.courseId,
              lessonId: shared.lessonId, title: shared.title, lessonNo, scheduledAt: shared.scheduledAt,
              durationMinutes: shared.durationMinutes, status: shared.status, notes: shared.notes,
              createdBy: shared.createdBy, studentId: new Types.ObjectId(sidStr), legacySharedSessionId: shared._id,
            }],
            { session: mongoSession },
          )
          summary.newDocsCreated++

          const scoreRes = await Score.updateMany(
            { sessionId: shared._id, studentId: sidStr },
            { $set: { sessionId: newDoc._id } },
            { session: mongoSession },
          )
          summary.scoresRepointed += scoreRes.modifiedCount

          const attendRes = await Attendance.updateMany(
            { sessionId: shared._id, studentId: sidStr },
            { $set: { sessionId: newDoc._id } },
            { session: mongoSession },
          )
          summary.attendanceRepointed += attendRes.modifiedCount
        }

        shared.migratedAt = new Date()
        await shared.save({ session: mongoSession })
      }
    })
  } finally {
    await mongoSession.endSession()
  }
  return summary
}

/** Backup ra file JSON TRƯỚC khi ghi — lưu ý: ổ đĩa Render là ephemeral (mất
 *  khi redeploy), nên hàm gọi (controller) PHẢI trả luôn nội dung backup này
 *  trong response để admin tải về máy, không chỉ trông chờ vào file server. */
async function backupBeforeWrite(sharedSessionIds: Types.ObjectId[]) {
  const [sessions, scores, attendance] = await Promise.all([
    ClassSession.find({ _id: { $in: sharedSessionIds } }).lean(),
    Score.find({ sessionId: { $in: sharedSessionIds } }).lean(),
    Attendance.find({ sessionId: { $in: sharedSessionIds } }).lean(),
  ])
  try {
    const dir = path.resolve(process.cwd(), `backups/pre-migration-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'classSessions.json'), JSON.stringify(sessions, null, 2))
    fs.writeFileSync(path.join(dir, 'scores.json'), JSON.stringify(scores, null, 2))
    fs.writeFileSync(path.join(dir, 'attendance.json'), JSON.stringify(attendance, null, 2))
  } catch {
    // Ổ đĩa ephemeral có thể không ghi được (VD read-only container) — không
    // chặn migration vì data đã được trả về response rồi, không mất.
  }
  return { sessions, scores, attendance }
}

export interface RunMigrationResult {
  alreadyRan: boolean
  ranAt?: Date
  summaries: ClassMigrationSummary[]
  backup?: { sessions: unknown[]; scores: unknown[]; attendance: unknown[] }
}

/** Chạy thật — fan-out buổi chung thành buổi riêng từng học sinh. KHÔNG xóa
 *  dữ liệu gốc (chỉ đánh dấu migratedAt), ghi marker 1 lần duy nhất (idempotent
 *  — gọi lại sẽ báo "đã chạy rồi" trừ khi force=true). */
export async function runSessionMigration(opts: { classId?: string; force?: boolean } = {}): Promise<RunMigrationResult> {
  if (!opts.force) {
    const already = await Migration.findOne({ key: SESSION_MIGRATION_KEY })
    if (already) return { alreadyRan: true, ranAt: already.ranAt, summaries: [] }
  }

  const classIds = await classIdsPending(opts.classId)
  const sharedSessions = await ClassSession.find(
    { classId: { $in: classIds }, studentId: { $exists: false }, migratedAt: { $exists: false } },
    '_id',
  ).lean()
  const backup = await backupBeforeWrite(sharedSessions.map((s) => s._id))

  const summaries: ClassMigrationSummary[] = []
  for (const classId of classIds) {
    summaries.push(await migrateOneClass(classId))
  }

  await Migration.create({
    key: SESSION_MIGRATION_KEY,
    meta: {
      classesProcessed: summaries.length,
      sessionsFanned: summaries.reduce((a, s) => a + s.sharedSessionsFound, 0),
      newDocsCreated: summaries.reduce((a, s) => a + s.newDocsCreated, 0),
      scoresRepointed: summaries.reduce((a, s) => a + s.scoresRepointed, 0),
    },
  })

  return { alreadyRan: false, summaries, backup }
}
