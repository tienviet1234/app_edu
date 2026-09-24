import type { Request, Response } from 'express'
import mongoose, { Types } from 'mongoose'
import { Attendance } from '../models/Attendance.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { Course } from '../models/Course.js'
import { Report } from '../models/Report.js'
import { Score } from '../models/Score.js'
import { User } from '../models/User.js'
import { badRequest, ok } from '../utils/response.js'

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

  // Dung lượng MongoDB đang dùng — để admin theo dõi trước khi chạm giới hạn
  // gói (VD Atlas M0 free giới hạn 512MB). db.stats() không tính qua model
  // nào, đọc thẳng thống kê thật của cả database.
  let storage: { dataSizeBytes: number; indexSizeBytes: number; totalSizeBytes: number } | null = null
  try {
    const stats = await mongoose.connection.db?.stats()
    if (stats) {
      storage = {
        dataSizeBytes: stats.dataSize ?? 0,
        indexSizeBytes: stats.indexSize ?? 0,
        totalSizeBytes: (stats.dataSize ?? 0) + (stats.indexSize ?? 0),
      }
    }
  } catch { /* không chặn phần còn lại của overview nếu lệnh stats lỗi */ }

  ok(res, {
    totals: { courses, teachers, students, parents, sessions, reports },
    attendance: attendanceStats,
    storage,
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

// ── GET /analytics/billing?month=YYYY-MM ─────────────────────────────────────
/** Học phí học sinh = đơn giá/buổi (đặt riêng từng lớp) × số buổi em đó có
 *  bản ghi buổi trong tháng — kể cả buổi điểm danh "Vắng" vẫn tính là 1 buổi
 *  (đã lên lịch dạy/học ngày đó), khớp đúng cách "Thống kê buổi" đã đếm.
 *
 *  Lương giáo viên có 2 cách, chọn riêng theo từng lớp (Class.teacherPayMode):
 *   - 'fixed': đơn giá/buổi CỐ ĐỊNH × số buổi đã dạy, không tính sĩ số.
 *   - 'perStudent': đơn giá/học-sinh-CÓ MẶT/buổi × tổng số lượt học sinh có
 *     mặt (present/late) cộng dồn cả tháng — buổi đông thì lương cao hơn.
 *
 *  Kèm bảng "days" chi tiết từng ngày (sĩ số, có mặt/vắng/muộn/phép, tên học
 *  sinh vắng) để admin đối chiếu trực tiếp với giáo viên khi có thắc mắc. */
export async function getBillingReport(req: Request, res: Response): Promise<void> {
  const { month } = req.query as Record<string, string>
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    badRequest(res, 'month (định dạng YYYY-MM) là bắt buộc.')
    return
  }
  const start = new Date(`${month}-01T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + 1)

  const classes = await Class.find(
    {},
    {
      name: 1, tuitionPerSession: 1, teacherPayPerSession: 1,
      teacherPayMode: 1, teacherPayPerStudentSession: 1, teacherId: 1, teacherName: 1,
    },
  ).lean()
  const classMap = new Map(classes.map((c) => [String(c._id), c]))

  const sessions = await ClassSession.find(
    {
      scheduledAt: { $gte: start, $lt: end },
      studentId: { $exists: true },
      migratedAt: { $exists: false },
    },
    { classId: 1, studentId: 1, createdBy: 1, scheduledAt: 1 },
  ).lean()

  const scores = await Score.find(
    { sessionId: { $in: sessions.map((s) => s._id) } },
    { sessionId: 1, attendance: 1 },
  ).lean()
  const attendanceBySessionId = new Map(scores.map((sc) => [String(sc.sessionId), sc.attendance as string]))

  // Học phí học sinh — key "classId:studentId" → Set các ngày khác nhau.
  const studentDayMap = new Map<string, Set<string>>()

  // Dữ liệu gốc để vừa tính lương theo sĩ số, vừa dựng bảng đối chiếu theo
  // ngày — key "classId:date" → studentId → { attendance, teacherId }.
  interface RawEntry { attendance: string; teacherId: string }
  const classDateMap = new Map<string, Map<string, RawEntry>>()

  const allUserIds = new Set<string>()

  for (const s of sessions) {
    if (!s.studentId) continue
    const dateKey = (s.scheduledAt as Date).toISOString().slice(0, 10)
    const classId = String(s.classId)
    const studentId = String(s.studentId)
    allUserIds.add(studentId)

    const studentKey = `${classId}:${studentId}`
    const days = studentDayMap.get(studentKey) ?? new Set<string>()
    days.add(dateKey)
    studentDayMap.set(studentKey, days)

    const teacherId = s.createdBy ? String(s.createdBy) : ''
    if (teacherId) allUserIds.add(teacherId)
    const attendance = attendanceBySessionId.get(String(s._id)) ?? 'present'

    const cdKey = `${classId}:${dateKey}`
    const dayMap = classDateMap.get(cdKey) ?? new Map<string, RawEntry>()
    dayMap.set(studentId, { attendance, teacherId })
    classDateMap.set(cdKey, dayMap)
  }

  const users = await User.find(
    { _id: { $in: [...allUserIds].map((id) => new Types.ObjectId(id)) } },
    { name: 1 },
  ).lean()
  const userNameMap = new Map(users.map((u) => [String(u._id), u.name as string]))

  const students = [...studentDayMap.entries()]
    .map(([key, days]) => {
      const [classId, studentId] = key.split(':')
      const cls = classMap.get(classId)
      const ratePerSession = cls?.tuitionPerSession ?? 0
      return {
        classId,
        className: cls?.name ?? '—',
        studentId,
        studentName: userNameMap.get(studentId) ?? '—',
        sessionsCount: days.size,
        ratePerSession,
        total: ratePerSession * days.size,
      }
    })
    .sort((a, b) => a.className.localeCompare(b.className, 'vi') || a.studentName.localeCompare(b.studentName, 'vi'))

  interface DayDetail {
    date: string
    totalStudents: number
    attendedStudents: number
    present: number
    late: number
    excused: number
    absent: number
    absentNames: string[]
  }

  // "classId:teacherId" → danh sách từng ngày đã dạy, để vừa tính lương vừa
  // hiện bảng đối chiếu chi tiết.
  const teacherClassDays = new Map<string, DayDetail[]>()

  for (const [cdKey, dayMap] of classDateMap.entries()) {
    const [classId, date] = cdKey.split(':')
    // Nhóm theo giáo viên trong đúng ngày đó — thường chỉ 1 người, nhưng
    // phòng trường hợp 2 giáo viên cùng chấm chung 1 ngày cho các em khác nhau.
    const byTeacher = new Map<string, { studentId: string; attendance: string }[]>()
    dayMap.forEach((entry, studentId) => {
      if (!entry.teacherId) return
      const list = byTeacher.get(entry.teacherId) ?? []
      list.push({ studentId, attendance: entry.attendance })
      byTeacher.set(entry.teacherId, list)
    })
    byTeacher.forEach((list, teacherId) => {
      const present = list.filter((x) => x.attendance === 'present').length
      const late = list.filter((x) => x.attendance === 'late').length
      const excused = list.filter((x) => x.attendance === 'excused').length
      const absent = list.filter((x) => x.attendance === 'absent').length
      const absentNames = list
        .filter((x) => x.attendance === 'absent')
        .map((x) => userNameMap.get(x.studentId) ?? '—')
      const key = `${classId}:${teacherId}`
      const dayList = teacherClassDays.get(key) ?? []
      dayList.push({
        date,
        totalStudents: list.length,
        attendedStudents: present + late,
        present, late, excused, absent, absentNames,
      })
      teacherClassDays.set(key, dayList)
    })
  }

  const teacherRows = [...teacherClassDays.entries()].map(([key, days]) => {
    const [classId, teacherId] = key.split(':')
    const cls = classMap.get(classId)
    const sortedDays = days.sort((a, b) => a.date.localeCompare(b.date))
    const payMode = cls?.teacherPayMode ?? 'fixed'
    let total = 0
    const ratePerSession = cls?.teacherPayPerSession ?? 0
    const ratePerStudentSession = cls?.teacherPayPerStudentSession ?? 0
    if (payMode === 'perStudent') {
      total = sortedDays.reduce((a, d) => a + d.attendedStudents * ratePerStudentSession, 0)
    } else {
      total = sortedDays.length * ratePerSession
    }
    return {
      classId,
      className: cls?.name ?? '—',
      teacherId,
      teacherName: userNameMap.get(teacherId) ?? cls?.teacherName ?? '—',
      payMode,
      ratePerSession,
      ratePerStudentSession,
      sessionsCount: sortedDays.length,
      total,
      days: sortedDays,
    }
  })

  const teacherTotals = new Map<
    string,
    { teacherId: string; teacherName: string; total: number; byClass: typeof teacherRows }
  >()
  teacherRows.forEach((row) => {
    const t = teacherTotals.get(row.teacherId) ?? {
      teacherId: row.teacherId, teacherName: row.teacherName, total: 0, byClass: [],
    }
    t.total += row.total
    t.byClass.push(row)
    teacherTotals.set(row.teacherId, t)
  })

  ok(res, {
    month,
    classes: classes.map((c) => ({
      classId: String(c._id),
      className: c.name,
      tuitionPerSession: c.tuitionPerSession ?? null,
      teacherPayMode: c.teacherPayMode ?? 'fixed',
      teacherPayPerSession: c.teacherPayPerSession ?? null,
      teacherPayPerStudentSession: c.teacherPayPerStudentSession ?? null,
    })),
    students,
    studentsTotal: students.reduce((a, s) => a + s.total, 0),
    teachers: [...teacherTotals.values()].sort((a, b) => b.total - a.total),
    teachersTotal: [...teacherTotals.values()].reduce((a, t) => a + t.total, 0),
  })
}
