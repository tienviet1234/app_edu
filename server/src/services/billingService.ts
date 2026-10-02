import { Types } from 'mongoose'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { Score } from '../models/Score.js'
import { User } from '../models/User.js'

export interface BillingDayDetail {
  date: string
  totalStudents: number
  attendedStudents: number
  present: number
  late: number
  excused: number
  absent: number
  absentNames: string[]
}

export interface BillingTeacherClassRow {
  classId: string
  className: string
  teacherId: string
  teacherName: string
  payMode: 'fixed' | 'perStudent'
  ratePerSession: number
  ratePerStudentSession: number
  sessionsCount: number
  total: number
  days: BillingDayDetail[]
}

export interface BillingReportResult {
  from: string
  to: string
  classes: Array<{
    classId: string
    className: string
    tuitionPerSession: number | null
    teacherPayMode: 'fixed' | 'perStudent'
    teacherPayPerSession: number | null
    teacherPayPerStudentSession: number | null
  }>
  unassignedClasses: Array<{ classId: string; className: string }>
  students: Array<{
    classId: string; className: string; studentId: string; studentName: string
    sessionsCount: number; ratePerSession: number; total: number
  }>
  studentsTotal: number
  teachers: Array<{ teacherId: string; teacherName: string; total: number; byClass: BillingTeacherClassRow[] }>
  teachersTotal: number
}

/** Tính học phí học sinh + lương giáo viên trong khoảng [from, to] (CẢ 2 đầu)
 *  — logic lõi dùng chung cho cả endpoint GET /analytics/billing (xem
 *  analyticsController.getBillingReport) LẪN cron nhắc lương chưa trả (xem
 *  billingReminderService.runBillingReminders), tách ra đây để không viết
 *  trùng 2 nơi dễ lệch nhau (sai 1 chỗ mà quên sửa chỗ kia — nguy hiểm vì
 *  đây là tiền thật). Xem đầy đủ ghi chú nghiệp vụ (vì sao dùng
 *  Class.teacherId chứ không phải ClassSession.createdBy...) ở
 *  analyticsController.getBillingReport. */
export async function computeBillingReport(from: string, to: string): Promise<BillingReportResult> {
  const start = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)

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
    { classId: 1, studentId: 1, scheduledAt: 1 },
  ).lean()

  const scores = await Score.find(
    { sessionId: { $in: sessions.map((s) => s._id) } },
    { sessionId: 1, attendance: 1 },
  ).lean()
  const attendanceBySessionId = new Map(scores.map((sc) => [String(sc.sessionId), sc.attendance as string]))

  const studentDayMap = new Map<string, Set<string>>()
  const classDateMap = new Map<string, Map<string, string>>()
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

    const attendance = attendanceBySessionId.get(String(s._id)) ?? 'present'
    const cdKey = `${classId}:${dateKey}`
    const dayMap = classDateMap.get(cdKey) ?? new Map<string, string>()
    dayMap.set(studentId, attendance)
    classDateMap.set(cdKey, dayMap)
  }

  classes.forEach((c) => { if (c.teacherId) allUserIds.add(String(c.teacherId)) })

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

  const teacherClassDays = new Map<string, BillingDayDetail[]>()
  const unassignedClassIds = new Set<string>()

  for (const [cdKey, dayMap] of classDateMap.entries()) {
    const [classId, date] = cdKey.split(':')
    const cls = classMap.get(classId)
    const teacherId = cls?.teacherId ? String(cls.teacherId) : ''
    if (!teacherId) { unassignedClassIds.add(classId); continue }

    const entries = [...dayMap.entries()]
    const present = entries.filter(([, a]) => a === 'present').length
    const late = entries.filter(([, a]) => a === 'late').length
    const excused = entries.filter(([, a]) => a === 'excused').length
    const absent = entries.filter(([, a]) => a === 'absent').length
    const absentNames = entries.filter(([, a]) => a === 'absent').map(([sid]) => userNameMap.get(sid) ?? '—')

    const key = `${classId}:${teacherId}`
    const dayList = teacherClassDays.get(key) ?? []
    dayList.push({
      date,
      totalStudents: entries.length,
      attendedStudents: present + late,
      present, late, excused, absent, absentNames,
    })
    teacherClassDays.set(key, dayList)
  }

  const teacherRows: BillingTeacherClassRow[] = [...teacherClassDays.entries()].map(([key, days]) => {
    const [classId, teacherId] = key.split(':')
    const cls = classMap.get(classId)
    const sortedDays = days.sort((a, b) => a.date.localeCompare(b.date))
    const payMode = cls?.teacherPayMode ?? 'fixed'
    const ratePerSession = cls?.teacherPayPerSession ?? 0
    const ratePerStudentSession = cls?.teacherPayPerStudentSession ?? 0
    const total = payMode === 'perStudent'
      ? sortedDays.reduce((a, d) => a + d.attendedStudents * ratePerStudentSession, 0)
      : sortedDays.length * ratePerSession
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

  const teacherTotals = new Map<string, { teacherId: string; teacherName: string; total: number; byClass: BillingTeacherClassRow[] }>()
  teacherRows.forEach((row) => {
    const t = teacherTotals.get(row.teacherId) ?? {
      teacherId: row.teacherId, teacherName: row.teacherName, total: 0, byClass: [],
    }
    t.total += row.total
    t.byClass.push(row)
    teacherTotals.set(row.teacherId, t)
  })

  return {
    from,
    to,
    classes: classes.map((c) => ({
      classId: String(c._id),
      className: c.name,
      tuitionPerSession: c.tuitionPerSession ?? null,
      teacherPayMode: c.teacherPayMode ?? 'fixed',
      teacherPayPerSession: c.teacherPayPerSession ?? null,
      teacherPayPerStudentSession: c.teacherPayPerStudentSession ?? null,
    })),
    unassignedClasses: [...unassignedClassIds].map((id) => ({
      classId: id, className: classMap.get(id)?.name ?? '—',
    })),
    students,
    studentsTotal: students.reduce((a, s) => a + s.total, 0),
    teachers: [...teacherTotals.values()].sort((a, b) => b.total - a.total),
    teachersTotal: [...teacherTotals.values()].reduce((a, t) => a + t.total, 0),
  }
}
