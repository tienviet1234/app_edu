import { classService } from '@/services/classes'
import { sessionService } from '@/services/sessions'
import { findMissingSessions, type MissingReport } from '@/business/missingSessions'
import { todayISO } from '@/utils/format'

export interface MissingClassResult {
  classId: string
  name: string
  names: Map<string, string>
  report: MissingReport
}

/** Quét buổi thiếu của mọi lớp đang hoạt động (chỉ đọc), theo thứ tự tên lớp. */
export async function scanMissingSessions(): Promise<MissingClassResult[]> {
  const { items } = await classService.list({ status: 'active', limit: '100' })
  const out: MissingClassResult[] = []
  const today = todayISO()
  for (const cls of items) {
    const [students, sessions] = await Promise.all([
      classService.getStudents(cls._id),
      sessionService.listAll({ classId: cls._id }),
    ])
    if (!students.length) continue
    const report = findMissingSessions(
      students.map((s) => s._id),
      sessions.filter((s) => s.studentId).map((s) => ({ studentId: s.studentId!, date: s.scheduledAt.slice(0, 10) })),
      today,
    )
    if (report.noOneDays.length || report.byStudent.length) {
      out.push({ classId: cls._id, name: cls.name, names: new Map(students.map((s) => [s._id, s.name])), report })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'vi', { numeric: true }))
}
