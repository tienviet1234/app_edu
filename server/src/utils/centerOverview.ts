/**
 * Dữ liệu cho các màn TỔNG QUAN TOÀN TRUNG TÂM (Học phí, Điểm danh & Điểm). Server chỉ
 * gom dữ liệu thô của mọi lớp người xem được thấy; mọi phép tính học phí/kỳ đến hạn
 * chạy ở máy bằng ĐÚNG các hàm của màn theo lớp (`business/tuition.ts`) để 2 màn luôn
 * ra cùng 1 con số. Thuần, không truy vấn DB — có test.
 */
import { gradedTotal } from './dataRules.js'
import { isClassTeacher } from './classAuth.js'

type Id = { toString(): string } | string
const s = (x: Id | null | undefined) => (x == null ? '' : String(x))
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')

export interface OverviewRaw {
  classes: Array<{ _id: Id; name: string; level?: string | null; teacherId?: Id | null; assistantTeacherIds?: Id[]; studentIds?: Id[]; tuitionPerSession?: number | null; studentTuition?: unknown[] }>
  users: Array<{ _id: Id; name: string; sessionOffset?: number | null }>
  sessions: Array<{ _id: Id; classId: Id; studentId?: Id | null; lessonNo?: number | null; scheduledAt?: Date | string | null; billed?: boolean | null; deletedAt?: Date | null; migratedAt?: Date | null }>
  scores: Array<{ sessionId: Id; attendance?: string | null; total?: number | null; [k: string]: unknown }>
  notices: Array<{ _id: Id; classId: Id; studentId: Id; periodFrom: number; periodTo: number; periodLabel: string; sessionIds?: Id[]; sessionsBilled: number; ratePerSession: number; finalAmount: number; sentAt?: Date | string | null; paymentStatus: string; paidAt?: Date | string | null }>
}

export interface CenterOverview {
  classes: Array<{ id: string; name: string; level: string | null; teacherName: string; tuitionPerSession: number | null; studentTuition: unknown[]; students: Array<{ id: string; name: string; sessionOffset?: number }> }>
  sessions: Array<{ id: string; classId: string; studentId: string; no: number; date: string; billed: boolean; attendance: string | null; total: number | null }>
  notices: Array<{ id: string; classId: string; studentId: string; periodFrom: number; periodTo: number; periodLabel: string; sessionIds: string[]; sessionsBilled: number; ratePerSession: number; finalAmount: number; sentAt: string; paymentStatus: string; paidAt: string | null }>
}

/** `viewer` admin thấy mọi lớp; giáo viên chỉ lớp mình là giáo viên chính hoặc phụ
 *  (`isClassTeacher`). Không lọc theo trạng thái lớp: lớp đã kết thúc vẫn có thể còn nợ
 *  học phí. Buổi đã xóa/đã chuyển bị bỏ. */
export function buildCenterOverview(raw: OverviewRaw, viewer: { id: string; role: string }): CenterOverview {
  const nameOf = new Map(raw.users.map((u) => [s(u._id), u]))
  const visible = raw.classes.filter((c) => viewer.role === 'admin' || isClassTeacher(c as never, viewer.id))
  const classIds = new Set(visible.map((c) => s(c._id)))
  const scoreOf = new Map(raw.scores.map((x) => [s(x.sessionId), x]))
  const sessions = raw.sessions
    .filter((x) => classIds.has(s(x.classId)) && x.studentId && !x.deletedAt && !x.migratedAt)
    .map((x) => {
      const sc = scoreOf.get(s(x._id))
      return { id: s(x._id), classId: s(x.classId), studentId: s(x.studentId), no: x.lessonNo ?? 0, date: day(x.scheduledAt), billed: !!x.billed, attendance: sc?.attendance ?? null, total: sc ? gradedTotal(sc) : null }
    })
  return {
    classes: visible.map((c) => ({
      id: s(c._id), name: c.name, level: c.level ?? null,
      teacherName: nameOf.get(s(c.teacherId))?.name ?? '',
      tuitionPerSession: c.tuitionPerSession ?? null,
      studentTuition: c.studentTuition ?? [],
      students: (c.studentIds ?? []).map((id) => { const u = nameOf.get(s(id)); return { id: s(id), name: u?.name ?? '?', ...(u?.sessionOffset ? { sessionOffset: u.sessionOffset } : {}) } }),
    })),
    sessions,
    notices: raw.notices.filter((n) => classIds.has(s(n.classId))).map((n) => ({
      id: s(n._id), classId: s(n.classId), studentId: s(n.studentId), periodFrom: n.periodFrom, periodTo: n.periodTo, periodLabel: n.periodLabel,
      sessionIds: (n.sessionIds ?? []).map(s), sessionsBilled: n.sessionsBilled, ratePerSession: n.ratePerSession, finalAmount: n.finalAmount,
      sentAt: day(n.sentAt), paymentStatus: n.paymentStatus, paidAt: n.paidAt ? day(n.paidAt) : null,
    })),
  }
}
