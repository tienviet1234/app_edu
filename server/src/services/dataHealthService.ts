import mongoose from 'mongoose'
import { listR2Keys } from './storageService.js'
import { billedMismatchKind, lonelyClassDays, navClicksWithoutSession, noticeAttendanceDrift, noticeCoverage, numberingProblem, perMonthOfClass } from '../utils/dataRules.js'
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
  const users = await db.collection('users').find({}, { projection: { name: 1, sessionOffset: 1 } }).toArray()
  const nameOf = (id: unknown) => users.find((u) => String(u._id) === String(id))?.name ?? 'Không rõ'
  const classes = await db.collection('classes').find({}, { projection: { name: 1, level: 1, studentIds: 1 } }).toArray()
  const classOf = (id: unknown) => classes.find((c) => String(c._id) === String(id))?.name ?? 'Lớp đã xóa'

  // Bản chụp mới nhất từng máy, bỏ bản gửi tay từ "Bản sao lưu trên máy" (-bk…).
  const snaps = await db.collection('clientsnapshots').aggregate([
    { $match: { deviceId: { $not: /-bk\d+$/ }, createdAt: { $gte: new Date(now - 30 * DAY) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$deviceId', userId: { $first: '$userId' }, unsent: { $first: '$unsyncedSessionCount' }, at: { $first: '$createdAt' } } },
  ]).toArray()

  const rejected = await db.collection('auditlogs').aggregate([
    { $match: { action: { $in: ['score.upsert.rejected', 'session.create.rejected', 'session.update.rejected'] }, createdAt: { $gte: new Date(now - 7 * DAY) } } },
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

  // Chỉ xét lớp CÒN TỒN TẠI: buổi của lớp đã xóa (trước khi có chốt chặn xóa lớp) không hiện ở
  // màn nào, liệt kê vào đây chỉ gây nhiễu ("vẫn thấy ngày trùng" — 10/11).
  const classIdSet = new Set(classes.map((c) => String(c._id)))
  const perDay = new Map<string, number>()
  for (const s of live) { if (!classIdSet.has(String(s.classId))) continue; const k = `${classOf(s.classId)} · ${nameOf(s.studentId)} · ${utcDay(s.scheduledAt)}`; perDay.set(k, (perDay.get(k) ?? 0) + 1) }
  // Học sinh đã rời lớp (không còn trong danh sách) mà còn buổi chưa thu → biến khỏi màn học phí.
  const leftUnbilled = new Map<string, number>()
  for (const s of live) {
    const c = classes.find((x) => String(x._id) === String(s.classId))
    if (!c || s.billed || (c.studentIds ?? []).some((x: unknown) => String(x) === String(s.studentId))) continue
    const k = `${c.name} · ${nameOf(s.studentId)}`
    leftUnbilled.set(k, (leftUnbilled.get(k) ?? 0) + 1)
  }

  const scores = await db.collection('scores').find({}, { projection: { sessionId: 1, attendance: 1 } }).toArray()
  const notices = await db.collection('tuitionnotices').find({}, { projection: { classId: 1, studentId: 1, sessionsBilled: 1, sessionIds: 1, periodFrom: 1, periodTo: 1, ratePerSession: 1, amount: 1, finalAmount: 1, paymentStatus: 1, periodLabel: 1 } }).toArray()
  const paidBy = new Map<string, number>()
  for (const n of notices) { const k = `${n.classId}|${n.studentId}`; paidBy.set(k, (paidBy.get(k) ?? 0) + noticeCoverage({ ...n, sessionIds: (n.sessionIds ?? []).map(String) })) }
  const flagsBy = new Map<string, number>()
  const unbilledBy = new Map<string, number>()
  for (const s of live) { const k = `${s.classId}|${s.studentId}`; if (s.billed) flagsBy.set(k, (flagsBy.get(k) ?? 0) + 1); else unbilledBy.set(k, (unbilledBy.get(k) ?? 0) + 1) }
  // Em có dấu "đã thu" mà không có phiếu nào → buổi bị ẩn.
  for (const k of flagsBy.keys()) if (!paidBy.has(k)) paidBy.set(k, 0)
  const billedMismatches: string[] = []
  const billedOverpaid: string[] = []
  for (const [k, paid] of paidBy) {
    const flagged = flagsBy.get(k) ?? 0
    const kind = billedMismatchKind(paid, flagged, unbilledBy.get(k) ?? 0)
    if (!kind) continue
    const [cid, sid] = k.split('|')
    const line = `${classOf(cid)} · ${nameOf(sid)}: phiếu phủ ${paid} buổi, ${flagged} buổi mang dấu đã thu`
    if (kind === 'overpaid') billedOverpaid.push(line)
    else billedMismatches.push(`${line} — ${kind === 'recharge' ? 'buổi đã đóng sẽ bị tính lại' : 'có buổi bị ẩn, không bao giờ được thu'}`)
  }
  // Điểm danh sửa SAU khi gửi phiếu → tiền trên phiếu lệch.
  const attOf = new Map(scores.map((s) => [String(s.sessionId), s.attendance as string | undefined]))
  const attendanceDrift: string[] = []
  for (const n of notices) {
    const ids = (n.sessionIds ?? []).map(String)
    const d = noticeAttendanceDrift({ ...n, sessionIds: ids }, ids.filter((id: string) => liveIds.has(id)).map((id: string) => ({ id, attendance: attOf.get(id) })))
    if (d) attendanceDrift.push(`${classOf(n.classId)} · ${nameOf(n.studentId)}: phiếu "${n.periodLabel ?? ''}" (${n.paymentStatus === 'paid' ? 'đã đóng' : 'chưa đóng'}) tính ${d.billed} buổi, nay ${d.chargeableNow} buổi tính tiền → ${d.diffAmount > 0 ? 'thu thiếu' : 'thu thừa'} ${Math.abs(d.diffAmount).toLocaleString('vi-VN')}đ`)
  }
  // Ngày chỉ vài em có buổi trong 30 ngày gần nhất.
  const since = utcDay(new Date(now - 30 * DAY))
  const lonelyDays = classes.filter((c) => c.studentIds?.length).flatMap((c) => lonelyClassDays({
    className: c.name, rosterSize: c.studentIds.length, sinceDate: since,
    sessions: live.filter((s) => String(s.classId) === String(c._id)).map((s) => ({ date: utcDay(s.scheduledAt), studentName: nameOf(s.studentId) })),
  }))
  // Số buổi mỗi em trong mỗi lớp phải đúng 1..n (quy định 10/11) — trống/trùng/nhảy số.
  const nosBy = new Map<string, number[]>()
  for (const s of live) { if (!classIdSet.has(String(s.classId))) continue; const k = `${s.classId}|${s.studentId}`; nosBy.set(k, [...(nosBy.get(k) ?? []), s.lessonNo ?? 0]) }
  const numberingBroken: string[] = []
  for (const [k, nos] of nosBy) {
    const [cid, sid] = k.split('|')
    const c = classes.find((x) => String(x._id) === cid)
    const off = (users.find((u) => String(u._id) === sid) as { sessionOffset?: number } | undefined)?.sessionOffset ?? 0
    const p = c ? numberingProblem(nos, perMonthOfClass({ name: c.name, level: c.level }), off) : null
    if (p) numberingBroken.push(`${classOf(cid)} · ${nameOf(sid)}: ${p}`)
  }
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
    leftWithUnbilled: [...leftUnbilled].map(([k, n]) => `${k}: ${n} buổi chưa thu`),
    numberingBroken,
    futureSessions: live.filter((s) => new Date(s.scheduledAt).getTime() > now + 2 * DAY).map((s) => `${classOf(s.classId)} · ${nameOf(s.studentId)} · ${utcDay(s.scheduledAt)} (ngày tương lai)`),
    scoresWithoutSession: scores.filter((s) => !known(String(s.sessionId))).length,
    scoresOnDeletedSession: scores.filter((s) => deleted.has(String(s.sessionId))).length,
    stuckNumbers: live.filter((s) => (s.lessonNo ?? 0) >= 1000).length,
    billedMismatches,
    billedOverpaid,
    attendanceDrift,
    lonelyDays,
    suspectInherited: suspectInherited(live.map((s) => ({ className: classOf(s.classId), studentName: nameOf(s.studentId), date: utcDay(s.scheduledAt), notes: s.notes, maxes: s.maxes }))),
    snapshotFailures: await db.collection('auditlogs').countDocuments({ action: 'clientSnapshot.failed', createdAt: { $gte: new Date(now - 7 * DAY) } }),
  })
}
