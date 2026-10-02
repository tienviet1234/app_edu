import { Types } from 'mongoose'
import { ClassSession } from '../models/ClassSession.js'
import { Class } from '../models/Class.js'
import { User } from '../models/User.js'

/** Buổi N của các em trong CÙNG 1 lớp lệch nhau quá ngưỡng này (ngày) thì
 *  KHÔNG coi là "chấm nối ngày hôm sau" nữa — rất có thể là 2 buổi thật khác
 *  nhau (VD lớp 1-kèm-1 lịch học lệch nhau), không tự gộp để tránh sửa sai
 *  dữ liệu thật. */
const SPLIT_THRESHOLD_DAYS = 3

export interface DateSplitGroup {
  date: string
  studentIds: string[]
  studentNames: string[]
}

export interface DateSplitSummary {
  classId: string
  className: string
  lessonNo: number
  groups: DateSplitGroup[]
  suggestedDate: string
  sessionIdsToFix: string[]
}

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000)
}

/** Xem trước (KHÔNG ghi gì) — tìm các "buổi N" (lessonNo) của 1 lớp bị tách
 *  ra 2+ ngày gần nhau khác nhau giữa các học sinh (nhiều khả năng do giáo
 *  viên chấm nối sang hôm sau cho vài em còn sót, chứ không phải 2 buổi dạy
 *  thật khác nhau). Gợi ý "ngày đúng" = ngày có NHIỀU em nhất (hòa thì lấy
 *  ngày sớm hơn — khả năng cao là ngày dạy thật, số ít còn lại chấm trễ). */
export async function previewDateSplits(opts: { classId?: string } = {}): Promise<DateSplitSummary[]> {
  const filter: Record<string, unknown> = { studentId: { $exists: true }, migratedAt: { $exists: false } }
  if (opts.classId) filter.classId = new Types.ObjectId(opts.classId)

  const sessions = await ClassSession.find(filter, { classId: 1, studentId: 1, scheduledAt: 1, lessonNo: 1 }).lean()
  const classes = await Class.find({}, 'name').lean()
  const classNameMap = new Map(classes.map((c) => [String(c._id), c.name]))

  const studentIds = [...new Set(sessions.map((s) => String(s.studentId)))]
  const users = await User.find(
    { _id: { $in: studentIds.map((id) => new Types.ObjectId(id)) } }, 'name',
  ).lean()
  const nameMap = new Map(users.map((u) => [String(u._id), u.name as string]))

  const groups = new Map<string, typeof sessions>()
  sessions.forEach((s) => {
    if (s.lessonNo == null) return
    const key = `${s.classId}:${s.lessonNo}`
    const arr = groups.get(key) ?? []
    arr.push(s)
    groups.set(key, arr)
  })

  const result: DateSplitSummary[] = []
  for (const [key, arr] of groups.entries()) {
    const [classId, lessonNoStr] = key.split(':')
    const byDate = new Map<string, typeof arr>()
    arr.forEach((s) => {
      const d = (s.scheduledAt as Date).toISOString().slice(0, 10)
      const list = byDate.get(d) ?? []
      list.push(s)
      byDate.set(d, list)
    })
    if (byDate.size < 2) continue

    const dates = [...byDate.keys()].sort()
    if (daysBetween(dates[0], dates[dates.length - 1]) > SPLIT_THRESHOLD_DAYS) continue

    const dateGroups: DateSplitGroup[] = [...byDate.entries()]
      .map(([date, list]) => ({
        date,
        studentIds: list.map((s) => String(s.studentId)),
        studentNames: list.map((s) => nameMap.get(String(s.studentId)) ?? '—'),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    let suggestedDate = dateGroups[0].date
    let maxCount = -1
    dateGroups.forEach((g) => {
      if (g.studentIds.length > maxCount) { maxCount = g.studentIds.length; suggestedDate = g.date }
    })

    const sessionIdsToFix = arr
      .filter((s) => (s.scheduledAt as Date).toISOString().slice(0, 10) !== suggestedDate)
      .map((s) => String(s._id))

    result.push({
      classId, className: classNameMap.get(classId) ?? classId,
      lessonNo: Number(lessonNoStr), groups: dateGroups, suggestedDate, sessionIdsToFix,
    })
  }

  return result.sort((a, b) => a.className.localeCompare(b.className, 'vi') || a.lessonNo - b.lessonNo)
}

/** Chạy thật — gộp các buổi lệch ngày về đúng "ngày gợi ý" (giữ nguyên GIỜ
 *  gốc của từng buổi, chỉ đổi phần NGÀY). Không đụng Score/Attendance (chúng
 *  trỏ theo sessionId, không theo ngày, nên không cần sửa). Trả về bản backup
 *  (dữ liệu TRƯỚC khi sửa) để controller trả về cho admin tải về. */
export async function runDateSplitsFix(
  opts: { classId?: string; lessonNo?: number } = {},
): Promise<{ fixed: number; backup: unknown[] }> {
  const summaries = await previewDateSplits({ classId: opts.classId })
  const target = opts.lessonNo != null
    ? summaries.filter((s) => s.lessonNo === opts.lessonNo)
    : summaries

  const allSessionIds = target.flatMap((s) => s.sessionIdsToFix)
  if (!allSessionIds.length) return { fixed: 0, backup: [] }

  const docs = await ClassSession.find({ _id: { $in: allSessionIds } })
  const backup = docs.map((d) => d.toObject())
  const suggestedByClassLesson = new Map(target.map((s) => [`${s.classId}:${s.lessonNo}`, s.suggestedDate]))

  let fixed = 0
  for (const doc of docs) {
    const key = `${doc.classId}:${doc.lessonNo}`
    const suggestedDate = suggestedByClassLesson.get(key)
    if (!suggestedDate) continue
    const old = doc.scheduledAt
    const newDate = new Date(`${suggestedDate}T00:00:00.000Z`)
    newDate.setUTCHours(old.getUTCHours(), old.getUTCMinutes(), old.getUTCSeconds(), old.getUTCMilliseconds())
    doc.scheduledAt = newDate
    await doc.save()
    fixed++
  }
  return { fixed, backup }
}
