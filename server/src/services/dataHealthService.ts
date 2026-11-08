import mongoose from 'mongoose'
import { listR2Keys } from './storageService.js'
import { navClicksWithoutSession, noticeCoverage } from '../utils/dataRules.js'
import { morningAlertFrom, summarizeDataHealth, suspectInherited } from '../utils/dataHealth.js'
import { Notification } from '../models/Notification.js'
import { User } from '../models/User.js'

// Gói Atlas miễn phí. Đầy thì mọi lệnh ghi bị từ chối, nên phải thấy trước.
const ATLAS_LIMIT_BYTES = 512 * 1024 * 1024
const DAY = 24 * 3600 * 1000
const vnDay = (d: Date) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 10)
const utcDay = (d: Date) => new Date(d).toISOString().slice(0, 10)

/** Chạy mỗi sáng qua POST /api/cron/check-data-health. Gửi vào chuông của mọi admin
 *  đang hoạt động khi có mục "cần xử lý ngay", mỗi ngày tối đa 1 lần. Chỉ nhắc, không
 *  tự sửa gì. */
export async function sendDataHealthAlert(): Promise<{ sent: number; level: string; alreadySentToday?: boolean }> {
  const health = await readDataHealth()
  const alert = morningAlertFrom(health)
  if (!alert) return { sent: 0, level: health.level }
  const day = vnDay(new Date())
  if (await Notification.findOne({ 'data.kind': 'data-health-alert', 'data.day': day }).lean()) {
    return { sent: 0, level: health.level, alreadySentToday: true }
  }
  const admins = await User.find({ role: 'admin', isActive: true }, '_id').lean()
  if (admins.length) {
    await Notification.insertMany(admins.map((a) => ({
      recipientId: a._id, title: alert.title, body: alert.body, type: 'system' as const, data: { kind: 'data-health-alert', day },
    })))
  }
  return { sent: admins.length, level: health.level }
}

/** CHỈ ĐỌC. Đọc các lớp bảo vệ dữ liệu, đưa cho summarizeDataHealth kết luận. */
export async function readDataHealth() {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database chưa kết nối.')
  const now = Date.now()

  let latestBackupAt: number | null | undefined
  let backupCount: number | null = null
  try {
    const keys = await listR2Keys('backups/')
    backupCount = keys.length
    const times = keys.map((k) => k.lastModified?.getTime() ?? 0).filter(Boolean)
    latestBackupAt = times.length ? Math.max(...times) : null
  } catch {
    latestBackupAt = undefined
  }

  const stats = await db.stats()
  const users = await db.collection('users').find({}, { projection: { name: 1 } }).toArray()
  const nameOf = (id: unknown) => users.find((u) => String(u._id) === String(id))?.name ?? 'Không rõ'
  const classes = await db.collection('classes').find({}, { projection: { name: 1, studentIds: 1 } }).toArray()
  const classOf = (id: unknown) => classes.find((c) => String(c._id) === String(id))?.name ?? 'Lớp đã xóa'

  // Bản chụp mới nhất từng máy, bỏ bản gửi tay từ "Bản sao lưu trên máy" (-bk…).
  const snaps = await db.collection('clientsnapshots').aggregate([
    { $match: { deviceId: { $not: /-bk\d+$/ }, createdAt: { $gte: new Date(now - 30 * DAY) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$deviceId', userId: { $first: '$userId' }, unsent: { $first: '$unsyncedSessionCount' }, at: { $first: '$createdAt' } } },
  ]).toArray()

  const rejected = await db.collection('auditlogs').aggregate([
    { $match: { action: { $in: ['score.upsert.rejected', 'session.create.rejected'] }, createdAt: { $gte: new Date(now - 7 * DAY) } } },
    { $group: { _id: '$metadata.code', count: { $sum: 1 } } },
  ]).toArray()

  const live = await db.collection('classsessions').find(
    { deletedAt: { $exists: false }, migratedAt: { $exists: false } },
    { projection: { classId: 1, studentId: 1, scheduledAt: 1, lessonNo: 1, notes: 1, maxes: 1, billed: 1 } },
  ).toArray()
  const deleted = new Set((await db.collection('classsessions').find({ deletedAt: { $exists: true } }, { projection: { _id: 1 } }).toArray()).map((s) => String(s._id)))
  const liveIds = new Set(live.map((s) => String(s._id)))

  const clicks = await db.collection('auditlogs').find(
    { action: 'score.entry', 'metadata.sessionNo': 0, createdAt: { $gte: new Date(now - 14 * DAY) } },
    { projection: { metadata: 1, createdAt: 1 } },
  ).toArray()
  const missing = navClicksWithoutSession(
    clicks.map((a) => ({ className: String(a.metadata?.className ?? ''), studentName: String(a.metadata?.studentName ?? ''), date: vnDay(a.createdAt), sessionNo: 0 })),
    live.map((s) => ({ className: classOf(s.classId), studentName: nameOf(s.studentId), date: utcDay(s.scheduledAt) })),
  )

  const perDay = new Map<string, number>()
  for (const s of live) { const k = `${classOf(s.classId)} · ${nameOf(s.studentId)} · ${utcDay(s.scheduledAt)}`; perDay.set(k, (perDay.get(k) ?? 0) + 1) }

  const scores = await db.collection('scores').find({}, { projection: { sessionId: 1 } }).toArray()
  const notices = await db.collection('tuitionnotices').find({}, { projection: { classId: 1, studentId: 1, sessionsBilled: 1, sessionIds: 1, periodFrom: 1, periodTo: 1 } }).toArray()
  const paidBy = new Map<string, number>()
  for (const n of notices) { const k = `${n.classId}|${n.studentId}`; paidBy.set(k, (paidBy.get(k) ?? 0) + noticeCoverage({ ...n, sessionIds: (n.sessionIds ?? []).map(String) })) }
  const flagsBy = new Map<string, number>()
  for (const s of live) if (s.billed) { const k = `${s.classId}|${s.studentId}`; flagsBy.set(k, (flagsBy.get(k) ?? 0) + 1) }
  const billedMismatches = [...paidBy].filter(([k, paid]) => (flagsBy.get(k) ?? 0) !== paid).map(([k, paid]) => { const [cid, sid] = k.split('|'); return `${classOf(cid)} · ${nameOf(sid)}: phiếu phủ ${paid} buổi, ${flagsBy.get(k) ?? 0} buổi mang dấu đã thu` })
  const known = (id: string) => liveIds.has(id) || deleted.has(id)

  return summarizeDataHealth({
    now,
    latestBackupAt,
    backupCount,
    usedBytes: (stats.dataSize ?? 0) + (stats.indexSize ?? 0),
    limitBytes: ATLAS_LIMIT_BYTES,
    devices: snaps.map((s) => ({ label: `${nameOf(s.userId)} · máy ${String(s._id).slice(0, 8)}`, unsent: s.unsent ?? 0, lastSeenAt: new Date(s.at).getTime() })),
    rejected: rejected.map((r) => ({ code: String(r._id ?? 'KHÁC'), count: r.count })),
    clicksWithoutSession: missing,
    sameDatePairs: [...perDay].filter(([, n]) => n > 1).map(([k]) => k),
    futureSessions: live.filter((s) => new Date(s.scheduledAt).getTime() > now + 2 * DAY).map((s) => `${classOf(s.classId)} · ${nameOf(s.studentId)} · ${utcDay(s.scheduledAt)} (ngày tương lai)`),
    scoresWithoutSession: scores.filter((s) => !known(String(s.sessionId))).length,
    scoresOnDeletedSession: scores.filter((s) => deleted.has(String(s.sessionId))).length,
    stuckNumbers: live.filter((s) => (s.lessonNo ?? 0) >= 1000).length,
    billedMismatches,
    suspectInherited: suspectInherited(live.map((s) => ({ className: classOf(s.classId), studentName: nameOf(s.studentId), date: utcDay(s.scheduledAt), notes: s.notes, maxes: s.maxes }))),
    snapshotFailures: await db.collection('auditlogs').countDocuments({ action: 'clientSnapshot.failed', createdAt: { $gte: new Date(now - 7 * DAY) } }),
  })
}
