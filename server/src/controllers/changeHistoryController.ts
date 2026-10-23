import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { ChangeHistory } from '../models/ChangeHistory.js'
import { ClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { AuditLog } from '../models/AuditLog.js'
import { User } from '../models/User.js'
import { ok, badRequest, notFound } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { writeAudit } from '../services/auditService.js'
import { scoreFieldChanges, scoreRestoreSet } from '../utils/dataRules.js'

/** Trang "Lịch sử điểm" của admin: mọi phiên bản cũ (ChangeHistory, ghi bởi
 *  historyPlugin) của điểm + buổi học, và khôi phục 1 phiên bản điểm cũ mà
 *  không cần chạy lệnh tay. Khôi phục cũng đi qua historyPlugin → bản hiện tại
 *  được cất lại trước, khôi phục nhầm vẫn quay lại được. */

type Doc = Record<string, unknown>
const SESSION_FIELDS = ['lessonNo', 'scheduledAt', 'notes', 'maxes', 'billed', 'deletedAt'] as const
const show = (v: unknown): string | null =>
  v === undefined || v === null || v === '' ? null : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Ai ghi lần sửa ngay SAU bản cũ này — tra nhật ký (cùng bản ghi, trong vài giây). */
async function actorsFor(entries: Array<{ docId: Types.ObjectId; createdAt: Date }>, prefix: RegExp): Promise<Map<string, string>> {
  if (!entries.length) return new Map()
  const logs = await AuditLog.find({
    resourceId: { $in: [...new Set(entries.map((e) => String(e.docId)))].map((id) => new Types.ObjectId(id)) },
    action: prefix,
    createdAt: { $gte: new Date(Math.min(...entries.map((e) => e.createdAt.getTime())) - 5000) },
  }, 'resourceId actorId actorRole createdAt').lean()
  const names = new Map((await User.find({ _id: { $in: logs.map((l) => l.actorId).filter(Boolean) } }, 'name').lean()).map((u) => [String(u._id), u.name as string]))
  const out = new Map<string, string>()
  for (const e of entries) {
    const near = logs
      .filter((l) => String(l.resourceId) === String(e.docId) && Math.abs(new Date(l.createdAt).getTime() - e.createdAt.getTime()) < 15000)
      .sort((a, b) => Math.abs(new Date(a.createdAt).getTime() - e.createdAt.getTime()) - Math.abs(new Date(b.createdAt).getTime() - e.createdAt.getTime()))[0]
    if (near) out.set(`${e.docId}|${e.createdAt.getTime()}`, near.actorId ? names.get(String(near.actorId)) ?? 'không rõ' : String(near.actorRole) === 'system' ? 'hệ thống (sửa dữ liệu)' : 'không rõ')
  }
  return out
}

/** GET /api/admin/change-histories/sessions/:sessionId — mọi phiên bản điểm + buổi của 1 buổi. */
export const getSessionHistory = asyncHandler(async (req: Request, res: Response) => {
  const sessionId = String(req.params.sessionId)
  if (!Types.ObjectId.isValid(sessionId)) { badRequest(res, 'Mã buổi không hợp lệ.'); return }
  const session = await ClassSession.findById(sessionId).lean()
  if (!session) { notFound(res, 'Không tìm thấy buổi này.'); return }
  const score = await Score.findOne({ sessionId }).lean()
  const docIds = [session._id, ...(score ? [score._id] : [])]
  const entries = await ChangeHistory.find({ docId: { $in: docIds } }).sort({ createdAt: 1 }).lean()
  const scoreEntries = entries.filter((e) => e.coll === 'scores')
  const sessionEntries = entries.filter((e) => e.coll === 'classsessions')
  const scoreActors = await actorsFor(scoreEntries, /^score\./)
  const sessionActors = await actorsFor(sessionEntries, /^session\./)

  // Bản cũ thứ i → trạng thái ngay sau lần sửa đó = bản cũ thứ i+1, hoặc bản hiện tại.
  const scoreVersions = scoreEntries.map((e, i) => {
    const after = (scoreEntries[i + 1]?.before ?? score) as Doc | null
    const before = e.before as Doc
    return {
      id: String(e._id), at: e.createdAt, op: e.op,
      by: scoreActors.get(`${e.docId}|${e.createdAt.getTime()}`) ?? null,
      totalBefore: before.total ?? null, totalAfter: after?.total ?? null,
      changes: scoreFieldChanges(before, after),
      before: scoreRestoreSet(before),
    }
  }).reverse()
  const sessionVersions = sessionEntries.map((e, i) => {
    const after = (sessionEntries[i + 1]?.before ?? session) as Doc
    const before = e.before as Doc
    return {
      id: String(e._id), at: e.createdAt, op: e.op,
      by: sessionActors.get(`${e.docId}|${e.createdAt.getTime()}`) ?? null,
      changes: SESSION_FIELDS.filter((f) => show(before[f]) !== show(after?.[f])).map((field) => ({ field, before: show(before[field]), after: show(after?.[field]) })),
    }
  }).reverse()

  ok(res, {
    session: { _id: session._id, studentId: session.studentId, classId: session.classId, lessonNo: session.lessonNo, scheduledAt: session.scheduledAt, deletedAt: session.deletedAt ?? null, billed: !!session.billed },
    score: score ? scoreRestoreSet(score as unknown as Doc) : null,
    scoreUpdatedAt: score?.updatedAt ?? null,
    scoreVersions, sessionVersions,
  })
})

/** GET /api/admin/change-histories/students/:studentId — các lần sửa gần đây của 1 học sinh (kể cả buổi đã xóa). */
export const getStudentHistory = asyncHandler(async (req: Request, res: Response) => {
  const studentId = String(req.params.studentId)
  if (!Types.ObjectId.isValid(studentId)) { badRequest(res, 'Mã học sinh không hợp lệ.'); return }
  const [sessions, scores] = await Promise.all([
    ClassSession.find({ studentId }, 'lessonNo scheduledAt deletedAt classId').lean(),
    Score.find({ studentId }, 'sessionId').lean(),
  ])
  const sessionOfScore = new Map(scores.map((s) => [String(s._id), String(s.sessionId)]))
  const byId = new Map(sessions.map((s) => [String(s._id), s]))
  const entries = await ChangeHistory.find({ docId: { $in: [...sessions.map((s) => s._id), ...scores.map((s) => s._id)] } }, 'coll docId op createdAt')
    .sort({ createdAt: -1 }).limit(100).lean()
  ok(res, entries.map((e) => {
    const sid = e.coll === 'scores' ? sessionOfScore.get(String(e.docId)) : String(e.docId)
    const s = sid ? byId.get(sid) : undefined
    return { id: String(e._id), at: e.createdAt, coll: e.coll, op: e.op, sessionId: sid ?? null, lessonNo: s?.lessonNo ?? null, scheduledAt: s?.scheduledAt ?? null, sessionDeleted: !!s?.deletedAt }
  }))
})

/** POST /api/admin/change-histories/:id/restore — khôi phục 1 phiên bản ĐIỂM cũ. Chỉ điểm (buổi học có
 *  số buổi/ngày/dấu đã thu — sửa tay dễ lệch học phí). Bản hiện tại được cất lại trước (historyPlugin). */
export const restoreScoreVersion = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!Types.ObjectId.isValid(id)) { badRequest(res, 'Mã phiên bản không hợp lệ.'); return }
  const entry = await ChangeHistory.findById(id).lean()
  if (!entry) { notFound(res, 'Không còn phiên bản này (đã quá 180 ngày?).'); return }
  if (entry.coll !== 'scores') { badRequest(res, 'Chỉ khôi phục được phiên bản ĐIỂM.'); return }
  const current = await Score.findById(entry.docId).lean()
  if (!current) { notFound(res, 'Bản điểm này không còn trên server.'); return }
  const set = scoreRestoreSet(entry.before as Doc)
  await Score.updateOne({ _id: entry.docId }, { $set: set })
  await writeAudit(req, {
    action: 'score.restoreVersion', resource: 'Score', resourceId: String(entry.docId),
    metadata: { historyId: id, sessionId: String(current.sessionId), studentId: String(current.studentId), versionAt: entry.createdAt, totalFrom: current.total, totalTo: set.total },
  })
  ok(res, { restored: true, score: set })
})
