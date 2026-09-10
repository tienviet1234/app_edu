/**
 * Migration: buổi học chung (1 ClassSession/lớp) → buổi học riêng từng học sinh
 * (fan-out mỗi ClassSession chung thành N bản ghi, mỗi bản gắn 1 studentId).
 *
 * KHÔNG xóa dữ liệu gốc — chỉ đánh dấu `migratedAt` trên bản chung, tạo bản mới
 * kèm `legacySharedSessionId` trỏ ngược lại, và repoint Score/Attendance sang
 * bản mới.
 *
 * Cách chạy (từ thư mục server/):
 *   npx tsx src/scripts/migrateSessionsToPerStudent.ts --dry-run
 *   npx tsx src/scripts/migrateSessionsToPerStudent.ts --dry-run --classId=<id>
 *   npx tsx src/scripts/migrateSessionsToPerStudent.ts               (chạy thật)
 *   npx tsx src/scripts/migrateSessionsToPerStudent.ts --force       (bỏ qua guard đã chạy)
 *   npx tsx src/scripts/migrateSessionsToPerStudent.ts --rollback    (hoàn tác)
 *
 * LUÔN chạy --dry-run trước, đọc kỹ bảng tổng kết, rồi mới chạy thật.
 * Rollback CHỈ dùng được khi frontend chưa lên Phase 2 (còn hiểu cấu trúc cũ).
 */
import fs from 'node:fs'
import path from 'node:path'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db.js'
import { ClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { Attendance } from '../models/Attendance.js'
import { Class } from '../models/Class.js'
import { Migration } from '../models/Migration.js'

const MIGRATION_KEY = 'sessions-per-student-v1'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isForce = args.includes('--force')
const isRollback = args.includes('--rollback')
const classIdArg = args.find((a) => a.startsWith('--classId='))?.split('=')[1]

interface ClassSummary {
  className: string
  sharedSessionsFound: number
  newDocsCreated: number
  scoresRepointed: number
  attendanceRepointed: number
}

async function backupBeforeWrite(
  sharedSessionIds: Types.ObjectId[],
  scoreIds: Types.ObjectId[],
  attendanceIds: Types.ObjectId[],
): Promise<void> {
  const dir = path.resolve(process.cwd(), `backups/pre-migration-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })

  const [sessions, scores, attendance] = await Promise.all([
    ClassSession.find({ _id: { $in: sharedSessionIds } }).lean(),
    Score.find({ _id: { $in: scoreIds } }).lean(),
    Attendance.find({ _id: { $in: attendanceIds } }).lean(),
  ])
  fs.writeFileSync(path.join(dir, 'classSessions.json'), JSON.stringify(sessions, null, 2))
  fs.writeFileSync(path.join(dir, 'scores.json'), JSON.stringify(scores, null, 2))
  fs.writeFileSync(path.join(dir, 'attendance.json'), JSON.stringify(attendance, null, 2))
  console.log(`  📦 Backup: ${dir}`)
}

async function migrateOneClass(classId: Types.ObjectId): Promise<ClassSummary> {
  const cls = await Class.findById(classId, 'name studentIds').lean()
  const className = cls?.name ?? String(classId)

  const sharedSessions = await ClassSession.find({
    classId,
    studentId: { $exists: false },
    migratedAt: { $exists: false },
  }).sort({ scheduledAt: 1 })

  const summary: ClassSummary = {
    className, sharedSessionsFound: sharedSessions.length,
    newDocsCreated: 0, scoresRepointed: 0, attendanceRepointed: 0,
  }
  if (!sharedSessions.length) return summary

  // Bộ đếm buổi riêng cho từng học sinh, chạy tuần tự theo thời gian
  const lessonNoCounter = new Map<string, number>()
  const allSharedIds: Types.ObjectId[] = []
  const allScoreIds: Types.ObjectId[] = []
  const allAttendanceIds: Types.ObjectId[] = []

  const mongoSession = await mongoose.startSession()
  try {
    await mongoSession.withTransaction(async () => {
      for (const shared of sharedSessions) {
        allSharedIds.push(shared._id)

        const [scoreStudentIds, attendStudentIds] = await Promise.all([
          Score.find({ sessionId: shared._id }, 'studentId').session(mongoSession).lean(),
          Attendance.find({ sessionId: shared._id }, 'studentId').session(mongoSession).lean(),
        ])
        let studentIds = [
          ...new Set([...scoreStudentIds, ...attendStudentIds].map((x) => String(x.studentId))),
        ]
        if (!studentIds.length) {
          studentIds = (cls?.studentIds ?? []).map((id) => String(id))
        }

        for (const sidStr of studentIds) {
          const key = `${classId}:${sidStr}`
          const lessonNo = (lessonNoCounter.get(key) ?? 0) + 1
          lessonNoCounter.set(key, lessonNo)

          if (isDryRun) { summary.newDocsCreated++; continue }

          const [newDoc] = await ClassSession.create(
            [{
              classId: shared.classId,
              centerId: shared.centerId,
              courseId: shared.courseId,
              lessonId: shared.lessonId,
              title: shared.title,
              lessonNo,
              scheduledAt: shared.scheduledAt,
              durationMinutes: shared.durationMinutes,
              status: shared.status,
              notes: shared.notes,
              createdBy: shared.createdBy,
              studentId: new Types.ObjectId(sidStr),
              legacySharedSessionId: shared._id,
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
          if (scoreRes.modifiedCount > 1) {
            console.warn(`  ⚠ ${scoreRes.modifiedCount} Score docs matched {session=${shared._id}, student=${sidStr}} — expected ≤1`)
          }

          const attendRes = await Attendance.updateMany(
            { sessionId: shared._id, studentId: sidStr },
            { $set: { sessionId: newDoc._id } },
            { session: mongoSession },
          )
          summary.attendanceRepointed += attendRes.modifiedCount
        }

        if (!isDryRun) {
          shared.migratedAt = new Date()
          await shared.save({ session: mongoSession })
        }
      }
    })
  } finally {
    await mongoSession.endSession()
  }

  return summary
}

async function runForward(): Promise<void> {
  if (!isForce) {
    const already = await Migration.findOne({ key: MIGRATION_KEY })
    if (already) {
      console.log(`Migration "${MIGRATION_KEY}" đã chạy lúc ${already.ranAt.toISOString()}. Dùng --force để chạy lại.`)
      return
    }
  }

  const classIds = classIdArg
    ? [new Types.ObjectId(classIdArg)]
    : (await ClassSession.distinct('classId', { studentId: { $exists: false }, migratedAt: { $exists: false } })) as Types.ObjectId[]

  console.log(`${isDryRun ? '[DRY RUN] ' : ''}Bắt đầu migrate ${classIds.length} lớp...\n`)

  if (!isDryRun) {
    const sharedSessions = await ClassSession.find(
      { classId: { $in: classIds }, studentId: { $exists: false }, migratedAt: { $exists: false } },
      '_id',
    ).lean()
    const sharedIds = sharedSessions.map((s) => s._id)
    const [scores, attendance] = await Promise.all([
      Score.find({ sessionId: { $in: sharedIds } }, '_id').lean(),
      Attendance.find({ sessionId: { $in: sharedIds } }, '_id').lean(),
    ])
    await backupBeforeWrite(sharedIds, scores.map((s) => s._id), attendance.map((a) => a._id))
  }

  const summaries: ClassSummary[] = []
  for (const classId of classIds) {
    const summary = await migrateOneClass(classId)
    summaries.push(summary)
    if (summary.sharedSessionsFound > 0) {
      console.log(
        `  ${summary.className}: ${summary.sharedSessionsFound} buổi chung → ` +
        `${summary.newDocsCreated} buổi riêng, ${summary.scoresRepointed} điểm, ${summary.attendanceRepointed} điểm danh đã chuyển`,
      )
    }
  }

  console.table(summaries)

  if (isDryRun) {
    console.log('\n[DRY RUN] Không có gì được ghi. Chạy lại không kèm --dry-run để thực thi thật.')
    return
  }

  await Migration.create({
    key: MIGRATION_KEY,
    meta: {
      classesProcessed: summaries.length,
      sessionsFanned: summaries.reduce((a, s) => a + s.sharedSessionsFound, 0),
      newDocsCreated: summaries.reduce((a, s) => a + s.newDocsCreated, 0),
      scoresRepointed: summaries.reduce((a, s) => a + s.scoresRepointed, 0),
    },
  })
  console.log('\n✅ Migration hoàn tất, đã ghi marker.')
}

async function runRollback(): Promise<void> {
  const fannedDocs = await ClassSession.find({ legacySharedSessionId: { $exists: true } })
  if (!fannedDocs.length) {
    console.log('Không có bản ghi nào cần rollback.')
    return
  }
  console.log(`Rollback ${fannedDocs.length} bản ghi per-student...`)

  for (const doc of fannedDocs) {
    await Score.updateMany(
      { sessionId: doc._id },
      { $set: { sessionId: doc.legacySharedSessionId } },
    )
    await Attendance.updateMany(
      { sessionId: doc._id },
      { $set: { sessionId: doc.legacySharedSessionId } },
    )
    await ClassSession.updateOne({ _id: doc.legacySharedSessionId }, { $unset: { migratedAt: 1 } })
    await doc.deleteOne()
  }
  await Migration.deleteOne({ key: MIGRATION_KEY })
  console.log('✅ Rollback hoàn tất.')
}

async function main() {
  await connectDB()
  try {
    if (isRollback) await runRollback()
    else await runForward()
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('Migration lỗi:', err)
  process.exit(1)
})
