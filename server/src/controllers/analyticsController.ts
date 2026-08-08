import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { Attendance } from '../models/Attendance.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { Course } from '../models/Course.js'
import { Report } from '../models/Report.js'
import { Score } from '../models/Score.js'
import { User } from '../models/User.js'
import { ok } from '../utils/response.js'

export async function getAnalyticsOverview(_req: Request, res: Response): Promise<void> {
  const [
    courses,
    teachers,
    students,
    parents,
    sessions,
    reports,
    attendanceStats,
  ] = await Promise.all([
    Course.countDocuments({ status: { $ne: 'archived' } }),
    User.countDocuments({ role: 'teacher', isActive: true }),
    User.countDocuments({ role: 'student', isActive: true }),
    User.countDocuments({ role: 'parent', isActive: true }),
    ClassSession.countDocuments(),
    Report.countDocuments(),
    Attendance.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
    ]),
  ])

  ok(res, {
    totals: { courses, teachers, students, parents, sessions, reports },
    attendance: attendanceStats,
  })
}

// ── GET /analytics/attendance-trend?classId=xxx&limit=20 ──────────────────────
export async function getAttendanceTrend(req: Request, res: Response): Promise<void> {
  const { classId, limit = '20' } = req.query as Record<string, string>
  const matchStage: Record<string, unknown> = {}
  if (classId && Types.ObjectId.isValid(classId)) matchStage.classId = new Types.ObjectId(classId)

  // Group scores by session → count each attendance status
  const rows = await Score.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$sessionId',
        present:  { $sum: { $cond: [{ $eq: ['$attendance', 'present']  }, 1, 0] } },
        late:     { $sum: { $cond: [{ $eq: ['$attendance', 'late']     }, 1, 0] } },
        excused:  { $sum: { $cond: [{ $eq: ['$attendance', 'excused']  }, 1, 0] } },
        absent:   { $sum: { $cond: [{ $eq: ['$attendance', 'absent']   }, 1, 0] } },
        total:    { $sum: 1 },
        avgScore: { $avg: '$total' },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: Number(limit) },
  ])

  // Fetch session dates for labels
  const sessionIds = rows.map((r) => r._id)
  const sessions = await ClassSession.find(
    { _id: { $in: sessionIds } },
    { scheduledAt: 1, lessonNo: 1, title: 1 },
  ).lean()
  const sessionMap = new Map(sessions.map((s) => [String(s._id), s]))

  const data = rows.map((r, i) => {
    const sess = sessionMap.get(String(r._id))
    const attendRate = r.total > 0 ? Math.round(((r.present + r.late + r.excused) / r.total) * 100) : 0
    return {
      session: sess?.lessonNo ?? i + 1,
      label: sess?.title ?? `Buổi ${i + 1}`,
      date: sess?.scheduledAt ? (sess.scheduledAt as Date).toISOString().slice(0, 10) : null,
      present: r.present,
      late: r.late,
      excused: r.excused,
      absent: r.absent,
      total: r.total,
      attendRate,
      avgScore: r.avgScore != null ? Math.round(r.avgScore * 10) / 10 : null,
    }
  })

  ok(res, data)
}

// ── GET /analytics/score-heatmap?classId=xxx ─────────────────────────────────
export async function getScoreHeatmap(req: Request, res: Response): Promise<void> {
  const { classId } = req.query as Record<string, string>
  if (!classId || !Types.ObjectId.isValid(classId)) {
    ok(res, { sessions: [], students: [], cells: {} })
    return
  }

  const classOid = new Types.ObjectId(classId)

  const [sessions, scores] = await Promise.all([
    ClassSession.find({ classId: classOid }, { scheduledAt: 1, lessonNo: 1, title: 1 })
      .sort({ scheduledAt: 1 })
      .limit(40)
      .lean(),
    Score.find({ classId: classOid }, { sessionId: 1, studentId: 1, total: 1, attendance: 1 }).lean(),
  ])

  // Collect unique student IDs from scores
  const studentIdSet = new Set(scores.map((s) => String(s.studentId)))
  const studentDocs = await User.find(
    { _id: { $in: [...studentIdSet].map((id) => new Types.ObjectId(id)) } },
    { name: 1 },
  ).lean()

  const students = studentDocs.map((u) => ({ _id: String(u._id), name: u.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  // Build cells: cells[studentId][sessionId] = total | null
  const cells: Record<string, Record<string, number | null>> = {}
  for (const s of scores) {
    const sid = String(s.studentId)
    const sesId = String(s.sessionId)
    if (!cells[sid]) cells[sid] = {}
    cells[sid][sesId] = s.attendance === 'absent' ? null : (s.total ?? 0)
  }

  ok(res, {
    sessions: sessions.map((s, i) => ({
      _id: String(s._id),
      no: s.lessonNo ?? i + 1,
      label: s.title ?? `B${i + 1}`,
      date: (s.scheduledAt as Date).toISOString().slice(0, 10),
    })),
    students,
    cells,
  })
}

// ── GET /analytics/teacher-performance ───────────────────────────────────────
export async function getTeacherPerformance(_req: Request, res: Response): Promise<void> {
  // 1. Count classes per teacher
  const classCounts = await Class.aggregate([
    { $group: { _id: '$teacherId', classCount: { $sum: 1 } } },
  ]) as Array<{ _id: Types.ObjectId; classCount: number }>

  const teacherIds = classCounts.map((c) => c._id).filter(Boolean)

  // 2. Avg score per teacher (via Score.classId → Class.teacherId join)
  const scoreAvgs = await Score.aggregate([
    {
      $lookup: {
        from: 'classes',
        localField: 'classId',
        foreignField: '_id',
        as: 'cls',
      },
    },
    { $unwind: '$cls' },
    {
      $group: {
        _id: '$cls.teacherId',
        avgScore: { $avg: '$total' },
        scoreCount: { $sum: 1 },
      },
    },
  ]) as Array<{ _id: Types.ObjectId; avgScore: number; scoreCount: number }>

  // 3. Published report count per teacher
  const reportCounts = await Report.aggregate([
    { $match: { status: 'published' } },
    { $group: { _id: '$teacherId', reportCount: { $sum: 1 } } },
  ]) as Array<{ _id: Types.ObjectId; reportCount: number }>

  // 4. Fetch teacher names
  const teachers = await User.find({ _id: { $in: teacherIds }, role: 'teacher' }, { name: 1, email: 1 }).lean()
  const teacherMap = new Map(teachers.map((t) => [String(t._id), t]))

  const scoreMap  = new Map(scoreAvgs.map((x) => [String(x._id), x]))
  const reportMap = new Map(reportCounts.map((x) => [String(x._id), x]))

  const result = classCounts
    .filter((c) => c._id && teacherMap.has(String(c._id)))
    .map((c) => {
      const tid = String(c._id)
      const t = teacherMap.get(tid)!
      const sc = scoreMap.get(tid)
      const rc = reportMap.get(tid)
      return {
        teacher: { _id: tid, name: t.name as string, email: t.email as string },
        classCount: c.classCount,
        avgScore: sc ? Math.round((sc.avgScore ?? 0) * 10) / 10 : null,
        scoreCount: sc?.scoreCount ?? 0,
        reportCount: rc?.reportCount ?? 0,
      }
    })
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))

  ok(res, result)
}
