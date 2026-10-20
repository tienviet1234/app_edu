import type { ClassData, SessionEntry } from '@/types'
import { getClassRubric } from '@/constants/rubrics'
import { rescaleComp, sessionScore } from '@/business/scoring'
import { isMongoid } from '@/utils/mongoid'

/** 1 buổi CÓ DỮ LIỆU (đã chấm/điểm danh) trên 1 máy — ứng viên đẩy lên server. */
export interface ScoreJob {
  classId: string
  className: string
  studentId: string
  studentName: string
  sessionLocalId: string
  no: number
  date: string
  entry: SessionEntry
  total: number
  homework: string
  /** true = buổi chưa từng lên server (id tạm), phải tạo buổi trước. */
  needsCreate: boolean
  /** Máy đã sửa mà server chưa xác nhận — xem Session.dirty. */
  dirty: boolean
  maxes?: Record<string, number>
  /** Mốc bản server máy dựa vào — xem Session.baseUpdatedAt. */
  baseUpdatedAt?: string
}

/** Gom mọi buổi có dữ liệu của các lớp/học sinh ĐÃ có id server. Dùng chung
 *  cho đồng bộ nền khi mở app (App.tsx) và công cụ "Dữ liệu kẹt" của admin
 *  (quét bản chụp máy giáo viên) — 1 công thức duy nhất. Lớp lỗi rubric bị bỏ
 *  qua riêng, không làm dừng các lớp khác. */
export function collectScoreJobs(classes: ClassData[]): ScoreJob[] {
  const jobs: ScoreJob[] = []
  for (const c of classes) {
    try {
      if (!isMongoid(c.id)) continue
      const r = getClassRubric(c)
      for (const stu of c.students) {
        if (!isMongoid(stu.id)) continue
        for (const s of stu.sessions) {
          if (s.conflict) continue // 2 máy cùng sửa — chờ giáo viên chọn bản nào, không tự gửi
          const maxes = s.maxes ?? {}
          const comps = r.comps.map((comp) => (maxes[comp.key] != null ? rescaleComp(comp, maxes[comp.key]) : comp))
          const score = sessionScore(s.entry, { ...r, comps })
          // "Vắng phép" → sessionScore trả null (không tính điểm) nhưng VẪN là
          // dữ liệu điểm danh thật phải lên server — trước đây bị bỏ qua nên
          // điểm danh vắng phép kẹt mãi trên máy.
          const excused = s.entry?.attendance === 'excused'
          // Sửa riêng "Bài tập về nhà" (chưa chấm điểm) cũng là dữ liệu cần lên.
          const dirtyHomework = s.dirty === true && !!s.homework?.trim()
          if (score === null && !excused && !dirtyHomework) continue // buổi trống — không có gì để đẩy
          jobs.push({
            classId: c.id, className: c.name, studentId: stu.id, studentName: stu.name,
            sessionLocalId: s.id, no: s.no, date: s.date, entry: s.entry, total: score ?? 0,
            homework: s.homework ?? '', needsCreate: !isMongoid(s.id),
            dirty: s.dirty === true, maxes: s.maxes, baseUpdatedAt: s.baseUpdatedAt,
          })
        }
      }
    } catch (err) {
      console.error('collectScoreJobs: lỗi khi quét lớp', c.id, err)
    }
  }
  return jobs
}

/** Học sinh còn id tạm (chưa lên server) nhưng có buổi đã chấm — công cụ
 *  khôi phục không tự tạo học sinh, chỉ báo ra để xử lý tay. */
export function countUnsyncedStudentsWithData(classes: ClassData[]): Array<{ className: string; studentName: string; sessions: number }> {
  const out: Array<{ className: string; studentName: string; sessions: number }> = []
  for (const c of classes) {
    for (const stu of c.students) {
      if (isMongoid(stu.id) && isMongoid(c.id)) continue
      const n = stu.sessions.filter((s) => s.entry && (
        s.entry.attendance !== 'present'
        || Object.keys(s.entry.scores ?? {}).length || Object.keys(s.entry.ticks ?? {}).length
        || Object.keys(s.entry.choice ?? {}).length || Object.keys(s.entry.parts ?? {}).length
      )).length
      if (n) out.push({ className: c.name, studentName: stu.name, sessions: n })
    }
  }
  return out
}

export type JobKind =
  | 'create'          // chưa có buổi nào ngày đó trên server → tạo buổi + điểm
  | 'fillExisting'    // server đã có buổi CÙNG NGÀY nhưng chưa có điểm → điền vào đó
  | 'fill'            // buổi đã có id server, server chưa có điểm → điền
  | 'already'         // server đã có điểm cùng nội dung → không làm gì
  | 'conflict'        // server đã có điểm KHÁC → không ghi đè, báo người xem
  | 'deletedOnServer' // buổi đã bị xóa trên server → không tự hồi sinh, báo người xem
  | 'notInClass'      // học sinh không còn trong lớp (đã gộp/chuyển/xóa) hoặc lớp không còn → không tự tạo lại

export interface ServerSessionLite { _id: string; studentId?: string; scheduledAt: string; lessonNo?: number }
export interface ServerScoreLite {
  sessionId: string
  studentId: string
  total: number
  attendance: string
  scores?: Record<string, unknown>
  ticks?: Record<string, string[]>
  choice?: Record<string, string>
  parts?: Record<string, Record<string, unknown>>
  tags?: Record<string, string[]>
  skip?: Record<string, boolean>
  ev?: Record<string, unknown>
  note?: string
}

type EntryLike = Pick<ServerScoreLite, 'scores' | 'ticks' | 'choice' | 'parts'> & {
  attendance?: string
  tags?: Record<string, string[]>
  skip?: Record<string, boolean>
  ev?: Record<string, unknown>
  note?: string
}

const sortedEntries = <T>(rec: Record<string, T> | undefined, keep: (v: T) => boolean) =>
  Object.entries(rec ?? {}).filter(([, v]) => keep(v)).sort(([a], [b]) => (a < b ? -1 : 1))

const canonNums = (rec?: Record<string, unknown>) =>
  Object.entries(rec ?? {})
    .filter(([, v]) => v !== '' && v != null && !Number.isNaN(Number(v)))
    .map(([k, v]) => [k, Number(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))

/** Dạng chuẩn để so 2 bản điểm — bỏ ô trống, "8" = 8, thứ tự tick không quan
 *  trọng. So NỘI DUNG chứ không so tổng (tổng đổi theo rubric lớp lúc tính). */
function canonEntry(e: EntryLike): string {
  const sortedArrays = (rec?: Record<string, string[]>) =>
    sortedEntries(rec, (a) => !!a?.length).map(([k, a]) => [k, [...a].sort()])
  return JSON.stringify([
    e.attendance ?? 'present',
    canonNums(e.scores),
    sortedArrays(e.ticks),
    sortedEntries(e.choice, (v) => v !== '' && v != null),
    Object.entries(e.parts ?? {}).map(([k, v]) => [k, canonNums(v)] as const).filter(([, v]) => v.length).sort(([a], [b]) => (a < b ? -1 : 1)),
    sortedArrays(e.tags),
    sortedEntries(e.skip, (v) => !!v).map(([k]) => k),
    JSON.stringify(sortedEntries(e.ev, (v) => v != null && v !== '' && !(typeof v === 'object' && !Object.keys(v as object).length))),
    (e.note ?? '').trim(),
  ])
}

/** 2 bản điểm (trên máy / trên server) có cùng nội dung không. */
export function sameEntry(local: EntryLike, server: EntryLike): boolean {
  return canonEntry(local) === canonEntry(server)
}

export interface ClassifiedJob extends ScoreJob {
  kind: JobKind
  /** buổi trên server sẽ nhận điểm (fill/fillExisting/already/conflict). */
  targetSessionId?: string
  serverTotal?: number
  serverAttendance?: string
}

const sameScore = (job: ScoreJob, sc: ServerScoreLite) => sameEntry(job.entry, sc)

/** Đối chiếu từng buổi trên máy với server (danh sách buổi CHƯA XÓA + điểm
 *  của các lớp liên quan). Thuần, không gọi mạng — có test. Quy tắc an toàn:
 *  chỉ đẩy vào chỗ server CHƯA có điểm; có rồi mà khác thì chỉ báo
 *  (`conflict`), không bao giờ ghi đè. */
export function classifyScoreJobs(
  jobs: ScoreJob[],
  serverSessions: ServerSessionLite[],
  serverScores: ServerScoreLite[],
  /** Danh sách học sinh HIỆN TẠI của từng lớp trên server. Máy giữ bản cũ có
   *  thể còn học sinh đã bị gộp/chuyển lớp — không được tạo lại buổi cho em
   *  đó. Lớp không có trong map = lớp không còn trên server. */
  rosterByClass?: Map<string, Set<string>>,
): ClassifiedJob[] {
  const activeById = new Map(serverSessions.map((s) => [s._id, s]))
  const byStudentDay = new Map<string, ServerSessionLite>()
  for (const s of serverSessions) {
    if (!s.studentId) continue
    const k = `${s.studentId}|${s.scheduledAt.slice(0, 10)}`
    if (!byStudentDay.has(k)) byStudentDay.set(k, s)
  }
  const scoreByKey = new Map(serverScores.map((sc) => [`${sc.sessionId}|${sc.studentId}`, sc]))

  const withScore = (job: ScoreJob, sessionId: string, emptyKind: JobKind): ClassifiedJob => {
    const sc = scoreByKey.get(`${sessionId}|${job.studentId}`)
    if (!sc) return { ...job, kind: emptyKind, targetSessionId: sessionId }
    return {
      ...job, kind: sameScore(job, sc) ? 'already' : 'conflict',
      targetSessionId: sessionId, serverTotal: sc.total, serverAttendance: sc.attendance,
    }
  }

  return jobs.map((job) => {
    if (rosterByClass && !rosterByClass.get(job.classId)?.has(job.studentId)) return { ...job, kind: 'notInClass' }
    if (job.needsCreate) {
      const sameDay = byStudentDay.get(`${job.studentId}|${job.date}`)
      return sameDay ? withScore(job, sameDay._id, 'fillExisting') : { ...job, kind: 'create' }
    }
    if (!activeById.has(job.sessionLocalId)) return { ...job, kind: 'deletedOnServer' }
    return withScore(job, job.sessionLocalId, 'fill')
  })
}
