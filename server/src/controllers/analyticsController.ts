import type { Request, Response } from 'express'
import mongoose, { Types } from 'mongoose'
import { Attendance } from '../models/Attendance.js'
import { Class } from '../models/Class.js'
import { ClassSession } from '../models/ClassSession.js'
import { Course } from '../models/Course.js'
import { Report } from '../models/Report.js'
import { Score } from '../models/Score.js'
import { User } from '../models/User.js'
import { computeBillingReport } from '../services/billingService.js'
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

  // Group scores by session → count each attendance status. KHÔNG cắt ở đây:
  // mỗi học sinh có buổi riêng nên 1 lớp có (số em × số buổi) session — cắt
  // sớm sẽ chỉ giữ vài em đầu tiên. Gộp theo "Buổi số N" rồi mới lấy N buổi cuối.
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
        scoreSum: { $sum: { $ifNull: ['$total', 0] } },
      },
    },
  ])

  const sessionIds = rows.map((r) => r._id)
  const sessions = await ClassSession.find(
    { _id: { $in: sessionIds } },
    { scheduledAt: 1, lessonNo: 1 },
  ).lean()
  const sessionMap = new Map(sessions.map((s) => [String(s._id), s]))

  interface Bucket { no: number; date: string | null; present: number; late: number; excused: number; absent: number; total: number; scoreSum: number }
  const byNo = new Map<number, Bucket>()
  for (const r of rows) {
    const sess = sessionMap.get(String(r._id))
    const no = sess?.lessonNo ?? 0
    const date = sess?.scheduledAt ? (sess.scheduledAt as Date).toISOString().slice(0, 10) : null
    const b = byNo.get(no) ?? { no, date, present: 0, late: 0, excused: 0, absent: 0, total: 0, scoreSum: 0 }
    b.present += r.present; b.late += r.late; b.excused += r.excused; b.absent += r.absent
    b.total += r.total; b.scoreSum += r.scoreSum
    if (date && (!b.date || date < b.date)) b.date = date
    byNo.set(no, b)
  }

  const cap = Math.max(1, Math.min(200, Number(limit) || 20))
  const data = [...byNo.values()]
    .sort((x, y) => x.no - y.no)
    .slice(-cap)
    .map((b) => ({
      session: b.no,
      label: `Buổi ${b.no}`,
      date: b.date,
      present: b.present,
      late: b.late,
      excused: b.excused,
      absent: b.absent,
      total: b.total,
      attendRate: b.total > 0 ? Math.round(((b.present + b.late + b.excused) / b.total) * 100) : 0,
      avgScore: b.total > 0 ? Math.round((b.scoreSum / b.total) * 10) / 10 : null,
    }))

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
    ClassSession.find({ classId: classOid, migratedAt: { $exists: false } }, { scheduledAt: 1, lessonNo: 1, title: 1 })
      .sort({ scheduledAt: 1 })
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

  // Mỗi học sinh có buổi riêng → gộp thành 1 cột cho mỗi "Buổi số N" (lấy ngày
  // sớm nhất làm nhãn) để bảng không phình ra (số em × số buổi) cột.
  const colBySession = new Map<string, string>() // sessionId → id đại diện của cột
  const cols = new Map<number, { _id: string; no: number; date: string }>()
  sessions.forEach((s, i) => {
    const no = s.lessonNo ?? i + 1
    const date = (s.scheduledAt as Date).toISOString().slice(0, 10)
    const col = cols.get(no)
    if (!col) cols.set(no, { _id: String(s._id), no, date })
    else if (date < col.date) col.date = date
    colBySession.set(String(s._id), cols.get(no)!._id)
  })

  // Build cells: cells[studentId][columnId] = total | null
  const cells: Record<string, Record<string, number | null>> = {}
  for (const s of scores) {
    const sid = String(s.studentId)
    const colId = colBySession.get(String(s.sessionId))
    if (!colId) continue
    if (!cells[sid]) cells[sid] = {}
    cells[sid][colId] = s.attendance === 'absent' ? null : (s.total ?? 0)
  }

  ok(res, {
    sessions: [...cols.values()].sort((x, y) => x.no - y.no).map((c) => ({
      _id: c._id, no: c.no, label: `B${c.no}`, date: c.date,
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

// ── GET /analytics/billing?from=YYYY-MM-DD&to=YYYY-MM-DD ─────────────────────
/** Học phí học sinh = đơn giá/buổi (đặt riêng từng lớp) × số buổi em đó có
 *  bản ghi buổi trong khoảng [from, to] (CẢ 2 đầu) — kể cả buổi điểm danh
 *  "Vắng" vẫn tính là 1 buổi (đã lên lịch dạy/học ngày đó), khớp đúng cách
 *  "Thống kê buổi" đã đếm.
 *
 *  CỐ Ý dùng khoảng ngày TỰ CHỌN thay vì "tháng dương lịch cứng" (1 đến cuối
 *  tháng) như trước — lớp dạy LIÊN TỤC không nghỉ đúng theo ranh giới tháng,
 *  cắt cứng theo 1–31 làm buổi của cùng 1 chu kỳ dạy bị chia đôi giữa "tháng
 *  này" và "tháng kia", nhìn như thiếu buổi dù giáo viên đã điểm danh/nhập
 *  điểm đầy đủ. Để admin tự chọn đúng khoảng ngày khớp với chu kỳ trả lương
 *  thật của trung tâm (mặc định gợi ý tháng dương lịch hiện tại ở frontend,
 *  nhưng chỉnh được tự do).
 *
 *  Lương giáo viên LUÔN quy về Class.teacherId (giáo viên CHÍNH THỨC của
 *  lớp, chỉ admin gán được ở trang Lớp học) — CỐ Ý KHÔNG dùng
 *  ClassSession.createdBy (ai bấm lưu bản ghi buổi học đó). createdBy chỉ
 *  phản ánh AI THAO TÁC LƯU (có thể là admin sửa ngày/số buổi giúp, thêm bù
 *  buổi bị sót, hoặc 1 giáo viên khác hỗ trợ nhập hộ) — dùng nó để tính
 *  lương sẽ bị tính nhầm tiền từ giáo viên thật sang người vừa thao tác lưu,
 *  dù người đó không hề đứng lớp hôm đó. Nhược điểm: hệ thống hiện chưa hỗ
 *  trợ giáo viên dạy thay (1 buổi dạy bởi người khác giáo viên chính) — nếu
 *  trung tâm cần việc này, phải thêm tính năng riêng, không suy luận từ
 *  createdBy.
 *
 *  Lương giáo viên có 2 cách, chọn riêng theo từng lớp (Class.teacherPayMode):
 *   - 'fixed': đơn giá/buổi CỐ ĐỊNH × số buổi đã dạy, không tính sĩ số.
 *   - 'perStudent': đơn giá/học-sinh-CÓ MẶT/buổi × tổng số lượt học sinh có
 *     mặt (present/late) cộng dồn cả tháng — buổi đông thì lương cao hơn.
 *
 *  Kèm bảng "days" chi tiết từng ngày (sĩ số, có mặt/vắng/muộn/phép, tên học
 *  sinh vắng) để admin đối chiếu trực tiếp với giáo viên khi có thắc mắc. */
export async function getBillingReport(req: Request, res: Response): Promise<void> {
  const { from, to, teacherId } = req.query as Record<string, string>
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    badRequest(res, 'from/to (định dạng YYYY-MM-DD) là bắt buộc.')
    return
  }
  if (from > to) {
    badRequest(res, '"from" phải trước "to".')
    return
  }
  // teacherId tùy chọn — admin xem lương TỪNG GIÁO VIÊN theo đúng chu kỳ
  // riêng của cô đó (không phải ai cũng trả lương cùng 1 khoảng ngày), xem
  // ghi chú ở AdminBillingPage.tsx (mỗi giáo viên 1 bộ chọn ngày riêng).
  ok(res, await computeBillingReport(from, to, teacherId ? { teacherId } : undefined))
}
