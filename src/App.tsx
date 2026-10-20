import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { produce } from 'immer'
import { Btn } from '@/components/atoms/Btn'
import { C } from '@/constants/colors'
import { ROLE_LABELS } from '@/types/auth'
import { ProfileModal } from '@/features/profile/ProfileModal'
import { NotificationBell } from '@/components/molecules/NotificationBell'
import { SystemLogBell } from '@/components/molecules/SystemLogBell'
import { ToastContainer } from '@/components/molecules/ToastContainer'
import { Sidebar } from '@/components/molecules/Sidebar'
import { BottomNav } from '@/components/molecules/BottomNav'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { startClientSnapshotLoop } from '@/utils/clientSnapshot'
import { useQueryClient } from '@tanstack/react-query'
import { useClasses, useClassStudents, useSessions, useClassScores, usePwaInstall, useTuitionUnpaidCount, STUDENT_KEYS } from '@/hooks'
import { isMongoid } from '@/utils/mongoid'
import {
  pruneGoneFromServer, syncStudentsFromServer, adoptServerSession, markSessionSaved, type ServerScoreForSync,
} from '@/business/sync'
import { autoLevel } from '@/constants/rubrics'
import { collectScoreJobs, sameEntry } from '@/business/strandedScores'
import { tryLockSession, unlockSession } from '@/utils/syncLocks'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { classService, type ApiClass } from '@/services/classes'
import { toast } from '@/store/toastStore'
import type { AppData, ClassData } from '@/types'

// Các màn theo tab tách thành chunk riêng, chỉ tải khi thực sự mở tab đó —
// trước đây tất cả (kể cả recharts ở Dashboard/Report/Leaderboard, xlsx ở
// ClassesScreen...) bị gộp chung 1 file JS ~1.6MB dù chỉ dùng 1 tab/lần.
const SessionCountScreen = lazy(() =>
  import('@/features/billing/SessionCountScreen').then((m) => ({ default: m.SessionCountScreen })))
// "Chấm bằng AI" tạm ẩn khỏi menu — xem ghi chú ở ALL_TABS. Bỏ comment 2 dòng
// này + 2 chỗ khác (ALL_TABS, khối render) nếu muốn bật lại.
// const AiGradeScreen = lazy(() =>
//   import('@/features/entry/AiGradeScreen').then((m) => ({ default: m.AiGradeScreen })))
const ClassesScreen = lazy(() =>
  import('@/features/classes/ClassesScreen').then((m) => ({ default: m.ClassesScreen })))
const DashboardScreen = lazy(() =>
  import('@/features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))
const DebtScreen = lazy(() =>
  import('@/features/entry/DebtScreen').then((m) => ({ default: m.DebtScreen })))
const StudentDebtScreen = lazy(() =>
  import('@/features/student/StudentDebtScreen').then((m) => ({ default: m.StudentDebtScreen })))
const EntryScreen = lazy(() =>
  import('@/features/entry/EntryScreen').then((m) => ({ default: m.EntryScreen })))
const HomeworkScreen = lazy(() =>
  import('@/features/entry/HomeworkScreen').then((m) => ({ default: m.HomeworkScreen })))
const TuitionReportScreen = lazy(() =>
  import('@/features/report/TuitionReportScreen').then((m) => ({ default: m.TuitionReportScreen })))
const LeaderboardScreen = lazy(() =>
  import('@/features/leaderboard/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen })))
const LearnScreen = lazy(() =>
  import('@/features/learn/LearnScreen').then((m) => ({ default: m.LearnScreen })))
const NotificationsPage = lazy(() =>
  import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const ParentPortalScreen = lazy(() =>
  import('@/features/parent/ParentPortalScreen').then((m) => ({ default: m.ParentPortalScreen })))
const ParentScreen = lazy(() =>
  import('@/features/parent/ParentScreen').then((m) => ({ default: m.ParentScreen })))
const ReportScreen = lazy(() =>
  import('@/features/report/ReportScreen').then((m) => ({ default: m.ReportScreen })))
const StudentScreen = lazy(() =>
  import('@/features/student/StudentScreen').then((m) => ({ default: m.StudentScreen })))
const StudentPortalScreen = lazy(() =>
  import('@/features/student/StudentPortalScreen').then((m) => ({ default: m.StudentPortalScreen })))
const StudentHomeworkScreen = lazy(() =>
  import('@/features/student/StudentHomeworkScreen').then((m) => ({ default: m.StudentHomeworkScreen })))

/** Hiện trong lúc chunk JS của tab đang mở được tải về — chỉ xảy ra 1 lần
 *  cho mỗi tab (trình duyệt cache lại chunk sau lần đầu). */
function TabLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current/20"
        style={{ borderTopColor: C.board, color: C.board }}
      />
    </div>
  )
}

const ALL_TABS = [
  { key: 'dashboard', label: 'Tổng quan', icon: '📋', roles: ['teacher', 'admin'] },
  { key: 'entry', label: 'Nhập điểm', icon: '✏️', roles: ['teacher', 'admin'] },
  // "Chấm bằng AI" tạm ẩn khỏi menu theo yêu cầu (không dùng tính năng này
  // nữa) — code/màn hình (AiGradeScreen) vẫn còn nguyên, chỉ không hiện tab
  // để dễ bật lại sau này nếu cần, không phải xóa hẳn.
  // { key: 'ai-grade', label: 'Chấm bằng AI', icon: '🤖', roles: ['teacher', 'admin'] },
  { key: 'homework', label: 'Bài tập', icon: '📝', roles: ['teacher', 'admin'] },
  { key: 'debts', label: 'Nợ bài tập', icon: '📌', roles: ['teacher', 'admin'] },
  { key: 'my-scores', label: 'Điểm của tôi', icon: '📊', roles: ['student'] },
  { key: 'my-homework', label: 'Bài tập của tôi', icon: '📝', roles: ['student'] },
  { key: 'my-debts', label: 'Nợ bài tập', icon: '📌', roles: ['student'] },
  { key: 'board', label: 'Xếp hạng', icon: '🏆', roles: ['teacher', 'admin', 'student'] },
  { key: 'report', label: 'Báo cáo', icon: '📊', roles: ['teacher', 'admin'] },
  { key: 'tuition-report', label: 'Báo cáo + Học phí', icon: '💰', roles: ['teacher', 'admin'] },
  { key: 'billing', label: 'Thống kê buổi', icon: '📅', roles: ['teacher', 'admin'] },
  { key: 'parent', label: 'Phụ huynh', icon: '👨‍👩‍👧', roles: ['teacher', 'admin'] },
  { key: 'student', label: 'Học sinh', icon: '🎓', roles: ['teacher', 'admin'] },
  { key: 'classes', label: 'Lớp học', icon: '🏫', roles: ['teacher', 'admin'] },
  { key: 'learn', label: 'Học tập', icon: '📚', roles: ['teacher', 'admin', 'student'] },
  { key: 'notifications', label: 'Thông báo', icon: '🔔', roles: ['teacher', 'admin', 'student'] },
  { key: 'my-child', label: 'Con tôi', icon: '👶', roles: ['parent'] },
]

/** Suy ra tên giáo viên hiển thị cho 1 lớp — ưu tiên tên tài khoản giáo viên
 *  THẬT đã gán (`teacherId`, populate sẵn từ server), chỉ dùng `teacherName`
 *  (chữ tự do, giáo viên tự gõ ở ô "Giáo viên") khi chưa gán tài khoản nào.
 *  Dùng CHUNG cho lúc tạo lớp lần đầu lẫn lúc đồng bộ lại lớp đã có sẵn —
 *  tránh lệch công thức giữa 2 chỗ. */
function resolveTeacherName(ac: ApiClass, fallback: string): string {
  return ac.teacherId && typeof ac.teacherId === 'object' && 'name' in ac.teacherId
    ? (ac.teacherId as unknown as { name: string }).name
    : ac.teacherName ?? fallback
}

/** Tự động đẩy lên server các buổi học đã chấm điểm nhưng còn "kẹt lại"
 *  trên máy này (tạo cục bộ, chưa từng gửi lên server — do đổi buổi/học
 *  sinh quá nhanh trước khi kịp lưu, mất mạng giữa chừng, hoặc đóng tab
 *  đột ngột). Trước đây phải tự bấm nút "☁ Đồng bộ điểm cũ" ở màn Nhập
 *  điểm mới đẩy lên; giờ chạy 1 lần ngay khi mở app, không cần biết để
 *  bấm — tránh hiểu nhầm dữ liệu đã an toàn chỉ vì thấy chữ "Đã lưu" (đó
 *  là lưu vào TRÌNH DUYỆT, không phải lên server). */
async function autoSyncStrandedScores(
  classes: ClassData[],
  setData: (fn: (d: AppData) => void) => void,
) {
  // Công thức gom chung với công cụ "Dữ liệu kẹt" của admin (business/
  // strandedScores.ts) — bọc riêng từng lớp, tính cả buổi chỉ "vắng phép".
  const jobs = collectScoreJobs(classes)
  if (!jobs.length) return

  // Mọi thay đổi trên máy chỉ áp dụng SAU khi server xác nhận, qua hàm thuần
  // có test (business/sync.ts) — tìm đúng học sinh theo id lớp, không theo
  // "lớp đang chọn".
  const onStudent = (job: (typeof jobs)[number], fn: (st: ClassData['students'][number]) => void) =>
    setData(produce((d: AppData) => {
      const st = d.classes.find((c) => c.id === job.classId)?.students.find((s) => s.id === job.studentId)
      if (st) fn(st)
    }))

  let fail = 0
  let recovered = 0
  const stuckSameDate: string[] = []
  for (const job of jobs) {
    if (!tryLockSession(job.sessionLocalId)) continue // Nhập điểm đang gửi đúng buổi này
    const sent = { entry: job.entry, homework: job.homework, maxes: job.maxes }
    try {
      if (!job.needsCreate) {
        if (job.dirty) {
          // Máy đã SỬA mà server chưa xác nhận (lần lưu trước lỗi/đóng tab) →
          // đây mới là bản mới nhất, gửi THẬT (ghi đè).
          await sessionService.update(job.sessionLocalId, { notes: job.homework, ...(job.maxes ? { maxes: job.maxes } : {}) })
          await scoreService.upsert({ classId: job.classId, sessionId: job.sessionLocalId, studentId: job.studentId, ...job.entry, total: job.total })
          onStudent(job, (st) => markSessionSaved(st, job.sessionLocalId, sent))
        } else {
          // Không sửa gì trên máy này → chỉ là bản sao, CHỈ điền nếu server
          // CHƯA có (VD tạo buổi được nhưng gửi điểm lỗi). TRƯỚC ĐÂY gửi đè vô
          // điều kiện mỗi lần mở app → máy giữ bản CŨ đè mất điểm mới hơn do
          // máy khác/admin sửa (máy Mac 1 giáo viên đè 82 điểm mỗi lần F5).
          await scoreService.upsert({ classId: job.classId, sessionId: job.sessionLocalId, studentId: job.studentId, ...job.entry, total: job.total, ifAbsent: true })
        }
        continue
      }
      // placeByDate: server tự xếp buổi đúng vị trí theo NGÀY, không từ
      // chối vì trùng số (sự cố thật 18/10 — buổi kẹt vì máy giữ số cũ).
      try {
        const apiSession = await sessionService.create({
          classId: job.classId,
          studentId: job.studentId,
          title: `Buổi ${job.no}`,
          lessonNo: job.no,
          scheduledAt: `${job.date}T00:00:00.000Z`,
          notes: job.homework || undefined,
          ...(job.maxes ? { maxes: job.maxes } : {}),
          placeByDate: true,
        })
        await scoreService.upsert({ classId: job.classId, sessionId: apiSession._id, studentId: job.studentId, ...job.entry, total: job.total, ifAbsent: true })
        onStudent(job, (st) => adoptServerSession(st, job.sessionLocalId, apiSession._id, apiSession.lessonNo, sent))
        recovered++
      } catch (err) {
        const resp = (err as { response?: { status?: number; data?: { code?: string; data?: { existingId?: string; lessonNo?: number } } } }).response
        // Học sinh đã bị gộp/chuyển khỏi lớp — dữ liệu cũ trên máy, bỏ qua
        // (vẫn còn trong bản chụp sao lưu), không báo "lỗi mạng" mỗi lần mở app.
        if (resp?.status === 409 && resp.data?.code === 'NOT_IN_CLASS') {
          console.warn('autoSyncStrandedScores: học sinh không còn trong lớp, bỏ qua', job.studentName, job.date)
          continue
        }
        if (resp?.status !== 409 || resp.data?.code !== 'SAME_DATE' || !resp.data.data?.existingId) throw err
        // Server đã có buổi CÙNG NGÀY của em này. Chưa có điểm → điền vào.
        // Có điểm GIỐNG HỆT (VD admin đã đẩy hộ từ bản chụp) → chỉ liên kết.
        // Có điểm KHÁC → giữ nguyên cả 2, báo đích danh (không ghi đè).
        const existingId = resp.data.data.existingId
        const res = await scoreService.upsert({ classId: job.classId, sessionId: existingId, studentId: job.studentId, ...job.entry, total: job.total, ifAbsent: true })
        const same = !res.skipped || sameEntry(job.entry, res)
        if (res.deleted || !same) {
          stuckSameDate.push(`${job.studentName} (${job.date})`)
          continue
        }
        const lessonNo = resp.data.data.lessonNo
        onStudent(job, (st) => adoptServerSession(st, job.sessionLocalId, existingId, lessonNo, sent))
        if (!res.skipped) recovered++
      }
    } catch {
      fail++
    } finally {
      unlockSession(job.sessionLocalId)
    }
  }
  if (recovered > 0) {
    toast.success(`Đã khôi phục ${recovered} buổi học còn kẹt trên máy này lên server`, { persist: true })
  }
  if (stuckSameDate.length) {
    toast.error(`${stuckSameDate.length} buổi trên máy này trùng ngày với buổi đã có điểm trên server, chưa gộp (tránh ghi đè): ${stuckSameDate.join(', ')} — báo admin kiểm tra.`, { persist: true })
  }
  if (fail > 0) {
    toast.error(`${fail} buổi chưa đồng bộ được (lỗi mạng) — thử mở lại app sau`, { persist: true })
  }
}

/** Tự động đẩy lên server các học sinh còn "kẹt lại" máy này (lớp đã đồng
 *  bộ nhưng học sinh vẫn mang id tạm — thường do dán tên hàng loạt lúc tạo
 *  lớp trước đây bị bỏ sót). Trước đây phải tự mở từng lớp, thấy banner
 *  cảnh báo mới bấm "Đồng bộ ngay"; giờ chạy nền 1 lần khi mở app, không
 *  cần biết để bấm. */
async function autoSyncStrandedStudents(
  classes: ClassData[],
  setData: (fn: (d: AppData) => void) => void,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const targets = classes.filter((c) => isMongoid(c.id) && c.students.some((s) => !isMongoid(s.id)))
  if (!targets.length) return

  let ok = 0
  let fail = 0
  for (const c of targets) {
    const localOnly = c.students.filter((s) => !isMongoid(s.id))
    try {
      const created = await classService.addManagedStudents(c.id, localOnly.map((s) => s.name))
      setData(produce((d: AppData) => {
        const cls2 = d.classes.find((x) => x.id === c.id)
        localOnly.forEach((oldSt, i) => {
          const newSt = created[i]
          if (!newSt) return
          const stu2 = cls2?.students.find((s) => s.id === oldSt.id)
          if (stu2) stu2.id = newSt._id
        })
      }))
      // Bắt buộc làm mới cache useClassStudents(c.id) — nếu không, cache cũ
      // (staleTime 60s) vẫn thiếu các id vừa tạo, và effect "gỡ học sinh
      // không còn trong lớp" (phía dưới) sẽ hiểu nhầm là bị gỡ khỏi lớp rồi
      // xóa nhầm học sinh vừa đồng bộ xong khỏi local store.
      await queryClient.invalidateQueries({ queryKey: STUDENT_KEYS.byClass(c.id) })
      ok += created.length
    } catch {
      fail += localOnly.length
    }
  }
  if (ok > 0) {
    toast.success(`Đã tự động đồng bộ ${ok} học sinh còn thiếu lên server`)
  }
  if (fail > 0) {
    toast.error(`${fail} học sinh chưa đồng bộ được (lỗi mạng) — thử mở lại app sau`, { persist: true })
  }
}

// Ưu tiên hiển thị trực tiếp trên Bottom Nav (mobile) — tối đa 4 tab, còn lại vào "☰ Thêm"
const MOBILE_PRIMARY_KEYS: Record<string, string[]> = {
  teacher: ['dashboard', 'entry', 'board', 'homework'],
  admin: ['dashboard', 'entry', 'board', 'homework'],
  student: ['my-scores', 'my-homework', 'board', 'notifications'],
  parent: ['my-child'],
}

function splitMobileTabs(tabs: typeof ALL_TABS, role: string | undefined) {
  const priority = role ? MOBILE_PRIMARY_KEYS[role] : undefined
  if (priority) {
    const primary = priority
      .map((k) => tabs.find((t) => t.key === k))
      .filter((t): t is typeof ALL_TABS[number] => !!t)
    const overflow = tabs.filter((t) => !priority.includes(t.key))
    return { primary, overflow }
  }
  return { primary: tabs.slice(0, 4), overflow: tabs.slice(4) }
}

export default function App() {
  const {
    data, currentClassIndex, activeTab, saving,
    init, setData, setCurrentClass, setTab, updateClassById,
    exportData, importData, resetData,
  } = useAppStore()
  const { user, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { canInstall, install } = usePwaInstall()
  const [profileOpen, setProfileOpen] = useState(false)
  // Nhảy từ "Thống kê buổi" sang "Nhập điểm" đúng học sinh + đúng buổi để sửa
  // điểm — giáo viên và admin đều thao tác được, không giới hạn riêng ai.
  const [entryJumpTarget, setEntryJumpTarget] = useState<{ studentId: string; no: number } | null>(null)

  const { data: tuitionSummary } = useTuitionUnpaidCount()
  const TABS = ALL_TABS
    .filter((t) => !user || t.roles.includes(user.role))
    .map((t) => (t.key === 'tuition-report' ? { ...t, badge: tuitionSummary?.unpaidCount } : t))
  const { primary: mobilePrimary, overflow: mobileOverflow } = splitMobileTabs(TABS, user?.role)

  // Re-init when user changes so each account gets its own scoped data
  useEffect(() => { init(user?.id) }, [init, user?.id])

  const cls = data?.classes[currentClassIndex]
  // Class-scoped screens get an updater bound to THEIR class id, not "the
  // class currently selected" — a save still in flight when the user switches
  // class used to be written into the NEW class (updateClass follows
  // currentClassIndex), silently dropping e.g. the server id of a just-created
  // session. Paired with key={cls.id} below so each screen remounts per class.
  const clsId = cls?.id
  const updateClass = (fn: (c: ClassData) => void) => { if (clsId) updateClassById(clsId, fn) }

  // Sync classes into local store — backend scopes /api/classes to teacherId
  // for role=teacher; admin gets every active class in the center (no
  // teacherId filter applied server-side for that role).
  const canSyncClassList = user?.role === 'teacher' || user?.role === 'admin'
  const { data: apiClasses } = useClasses({ status: 'active', limit: '100' }, canSyncClassList)
  const apiClassesKey = apiClasses?.items.map((c) => c._id).join(',') ?? ''
  useEffect(() => {
    if (!data || !apiClasses?.items.length) return
    const missing = apiClasses.items.filter((ac) => !data.classes.some((c) => c.id === ac._id))
    if (!missing.length) return
    setData(produce((d: AppData) => {
      missing.forEach((ac) => {
        const teacherName = resolveTeacherName(ac, user?.name ?? '')
        // Ưu tiên `level` admin tự chọn tay (ô "Phiếu đánh giá") nếu có — chỉ
        // suy theo số trong tên lớp (autoLevel) khi chưa ai chọn tay, dành
        // cho lớp tên không có số (VD "Starters") vẫn chỉnh đúng Cấp được.
        const level = ac.level ?? autoLevel(ac.name)
        d.classes.push({
          id: ac._id,
          name: ac.name,
          teacher: teacherName,
          level,
          perMonth: level === 'primary' ? 8 : 12,
          students: [],
          comments: {},
          hiddenComps: ac.hiddenComps,
          extraComps: ac.extraComps,
          compOverrides: ac.compOverrides,
          compLabelOverrides: ac.compLabelOverrides,
          compExtraItems: ac.compExtraItems,
          customNotePhrases: ac.customNotePhrases,
        })
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiClassesKey, !!data])

  // Prune classes that no longer exist on the server (e.g. deleted by admin).
  // Must check against the FULL class list (any status, not just 'active') —
  // a class that's merely paused/completed still exists and must not be
  // wiped from local storage just because the active-only query above
  // doesn't return it.
  const { data: apiAllClasses } = useClasses({ limit: '100' }, canSyncClassList)
  const apiAllClassesKey = apiAllClasses?.items.map((c) => c._id).join(',') ?? ''
  useEffect(() => {
    if (!data || !apiAllClasses) return
    const validIds = new Set(apiAllClasses.items.map((c) => c._id))
    const hasStale = data.classes.some((c) => isMongoid(c.id) && !validIds.has(c.id))
    if (!hasStale) return
    const kept = data.classes.filter((c) => !isMongoid(c.id) || validIds.has(c.id))
    setData(produce((d: AppData) => { d.classes = kept }))
    if (currentClassIndex >= kept.length) setCurrentClass(Math.max(0, kept.length - 1))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiAllClassesKey, !!data])

  // Đồng bộ tiêu chí chấm điểm do admin tùy chỉnh (ẩn/hiện tiêu chí gốc, thêm
  // tiêu chí tùy chỉnh, đổi điểm/tên từng phần nhỏ — xem RubricEditor.tsx)
  // xuống local cho các lớp ĐÃ có sẵn — admin là nguồn duy nhất chỉnh 4 field
  // này (giáo viên không tự sửa) nên ghi đè thẳng từ server, không cần merge
  // như sessions/scores. Dùng updatedAt trong key để effect chạy lại đúng lúc
  // admin vừa lưu thay đổi, dù danh sách classId không đổi.
  // Cùng chỗ này đồng bộ luôn `name`/`teacher` (đổi tên lớp/tên giáo viên ở
  // máy khác trước đây KHÔNG BAO GIỜ tới được máy đã mở lớp đó sẵn — 1 tài
  // khoản đăng nhập 2 máy sẽ thấy 2 tên khác nhau, y hệt gotcha "chỉ thêm
  // không gỡ/không cập nhật" đã gặp với học sinh/buổi học).
  const apiAllClassesRubricKey = apiAllClasses?.items.map((c) => `${c._id}:${c.updatedAt}`).join(',') ?? ''
  useEffect(() => {
    if (!data || !apiAllClasses?.items.length) return
    const RUBRIC_FIELDS = ['hiddenComps', 'extraComps', 'compOverrides', 'compLabelOverrides', 'compExtraItems', 'customNotePhrases'] as const
    // `level`/`teacher` so sánh RIÊNG (không gộp vào RUBRIC_FIELDS) vì cả 2
    // đều là giá trị ĐÃ SUY RA từ server (qua autoLevel/resolveTeacherName),
    // so trực tiếp với field thô sẽ luôn lệch ở lớp chưa ai chọn tay/gán tài khoản.
    const changedIds = new Set(
      apiAllClasses.items
        .filter((ac) => {
          const localCls = data.classes.find((c) => c.id === ac._id)
          if (!localCls) return false
          if (localCls.level !== (ac.level ?? autoLevel(ac.name))) return true
          if (localCls.name !== ac.name) return true
          if (localCls.teacher !== resolveTeacherName(ac, localCls.teacher)) return true
          return RUBRIC_FIELDS.some((f) => JSON.stringify(localCls[f] ?? null) !== JSON.stringify(ac[f] ?? null))
        })
        .map((ac) => ac._id),
    )
    if (!changedIds.size) return
    setData(produce((d: AppData) => {
      d.classes.forEach((localCls) => {
        if (!changedIds.has(localCls.id)) return
        const ac = apiAllClasses.items.find((x) => x._id === localCls.id)!
        const resolvedLevel = ac.level ?? autoLevel(ac.name)
        if (localCls.level !== resolvedLevel) {
          localCls.level = resolvedLevel
          localCls.perMonth = resolvedLevel === 'primary' ? 8 : 12
        }
        localCls.name = ac.name
        localCls.teacher = resolveTeacherName(ac, localCls.teacher)
        localCls.hiddenComps = ac.hiddenComps
        localCls.extraComps = ac.extraComps
        localCls.compOverrides = ac.compOverrides
        localCls.compLabelOverrides = ac.compLabelOverrides
        localCls.compExtraItems = ac.compExtraItems
        localCls.customNotePhrases = ac.customNotePhrases
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiAllClassesRubricKey, !!data])

  // Sync API-enrolled students into local store
  const { data: apiStudents } = useClassStudents(
    cls && isMongoid(cls.id) ? cls.id : '',
  )
  const apiStudentsKey = apiStudents?.map((s) => s._id).join(',') ?? ''
  useEffect(() => {
    if (!apiStudents?.length || !cls || !isMongoid(cls.id)) return
    setData(produce((d: AppData) => {
      const localCls = d.classes[currentClassIndex]
      const apiIds = new Set(apiStudents.map((s) => s._id))
      apiStudents.forEach((apiSt) => {
        const existing = localCls.students.find((s) => s.id === apiSt._id)
        if (existing) {
          existing.name = apiSt.name
          if (apiSt.avatar) existing.avatar = apiSt.avatar
          existing.handwritingNote = apiSt.handwritingNote
          existing.sessionOffset = apiSt.sessionOffset
        } else {
          localCls.students.push({
            id: apiSt._id, name: apiSt.name, avatar: apiSt.avatar,
            handwritingNote: apiSt.handwritingNote, sessionOffset: apiSt.sessionOffset, sessions: [],
          })
        }
      })
      // Gỡ học sinh đã đồng bộ (isMongoid) nhưng server không còn liệt kê
      // trong lớp này nữa (VD: bị gộp/chuyển sang tài khoản khác qua tính
      // năng "Chuyển lớp" — Class.studentIds đổi nhưng cache local cũ vẫn
      // còn giữ bản ghi cũ). Không đụng học sinh local-only (chưa isMongoid).
      localCls.students = pruneGoneFromServer(localCls.students, apiIds)
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiStudentsKey, currentClassIndex])

  // Sync per-student sessions + scores from server into local store — fills in
  // sessions that don't exist locally yet (e.g. opening this class on a device
  // for the first time) and gỡ buổi đã đồng bộ nhưng server không còn liệt kê
  // trong lớp này nữa (VD: bị gộp/chuyển lớp qua tính năng "Chuyển lớp" —
  // trước đây hiệu ứng này CHỈ THÊM, không bao giờ gỡ, nên máy nào đã mở lớp
  // "nguồn" trước khi chuyển sẽ mãi mãi hiển thị buổi cũ trùng với buổi đã
  // xuất hiện ở lớp đích — y hệt lỗi "sửa ở admin, giáo viên không thấy cập
  // nhật" vì máy giáo viên đã cache lớp đó từ trước).
  // Restricted to teacher/admin: scores.list returns the WHOLE class's scores,
  // which must never land in a student/parent's local storage.
  const canSyncWholeClass = user?.role === 'teacher' || user?.role === 'admin'
  const syncClassId = canSyncWholeClass && cls && isMongoid(cls.id) ? cls.id : ''
  const { data: apiSessions } = useSessions(syncClassId)
  const { data: apiScores, isError: scoresError } = useClassScores(syncClassId)
  // Có updatedAt: admin đổi số buổi/ngày/bài tập/số câu (id không đổi) thì
  // máy khác cũng phải nhận ra — trước đây chỉ có id nên không bao giờ biết.
  const apiSessionsKey = apiSessions?.items.map((s) => s._id + s.updatedAt).join(',') ?? ''
  const apiScoresKey = apiScores?.items.map((s) => s._id + s.updatedAt).join(',') ?? ''
  useEffect(() => {
    // apiSessions === undefined nghĩa là CHƯA tải xong (hoặc sync đang tắt vì
    // role/lớp không hợp lệ) — không được coi là "server có 0 buổi" rồi gỡ
    // sạch buổi đang có, phải đợi tải xong mới biết chắc danh sách thật.
    // Điểm chưa tải xong cũng đợi — nếu không, buổi mới về sẽ được thêm với
    // nội dung TRỐNG rồi đánh dấu synced, sau đó điểm server về lại phải ghi đè.
    // (Tải điểm LỖI thì vẫn đồng bộ danh sách buổi — không có điểm server thì
    // hàm đồng bộ không đụng nội dung buổi nào.)
    if (!cls || !syncClassId || apiSessions === undefined || (apiScores === undefined && !scoresError)) return
    // Quy tắc đồng bộ (ai thắng khi máy và server khác nhau) nằm ở hàm thuần
    // có test — business/sync.ts syncStudentsFromServer. Trước đây viết thẳng
    // ở đây và CHỈ điền buổi trống → máy A sửa điểm, máy B mãi hiện điểm cũ.
    const serverSessions = apiSessions.items.map((as) => ({
      _id: as._id, studentId: as.studentId, scheduledAt: as.scheduledAt, lessonNo: as.lessonNo,
      notes: as.notes, billed: as.billed, maxes: as.maxes, createdAt: as.createdAt,
      createdByName: as.createdBy && typeof as.createdBy === 'object' ? as.createdBy.name : undefined,
    }))
    const scoresBySession = new Map((apiScores?.items ?? []).map((s) => [s.sessionId, s as unknown as ServerScoreForSync]))
    setData((d: AppData) => {
      const localCls = d.classes.find((c) => c.id === syncClassId)
      if (localCls) syncStudentsFromServer(localCls.students, serverSessions, scoresBySession)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSessionsKey, apiScoresKey, syncClassId, scoresError])

  // Tự động đồng bộ học sinh + điểm còn kẹt lại máy này lên server — 1 lần
  // mỗi khi mở app (không lặp lại liên tục vì effect chỉ phụ thuộc userId,
  // không phụ thuộc `data` — tránh gọi lại mỗi khi gõ điểm làm `data` đổi
  // liên tục). Đồng bộ HỌC SINH trước — điểm của 1 buổi chỉ đồng bộ được
  // khi chính học sinh đó đã có id thật trên server.
  const autoSyncedForRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!data || !user) return
    if (user.role !== 'teacher' && user.role !== 'admin') return
    if (autoSyncedForRef.current === user.id) return
    autoSyncedForRef.current = user.id
    void (async () => {
      try {
        await autoSyncStrandedStudents(data.classes, setData, queryClient)
        const fresh = useAppStore.getState().data
        if (fresh) await autoSyncStrandedScores(fresh.classes, setData)
      } catch (err) {
        // Trước đây lỗi ở đây biến mất hoàn toàn (không try/catch), khiến
        // điểm không lên được server mà không ai biết vì sao — giờ luôn báo
        // rõ ràng thay vì im lặng.
        console.error('Lỗi đồng bộ tự động:', err)
        toast.error('Có lỗi khi tự động đồng bộ dữ liệu — thử tải lại trang.', { persist: true })
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, user?.id])

  // Bản chụp toàn bộ dữ liệu máy này gửi lên server (5 phút/lần khi có đổi +
  // khi rời tab) — lưới an toàn kể cả với dữ liệu chưa lên server được. Xem
  // utils/clientSnapshot.ts.
  useEffect(() => {
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) return
    return startClientSnapshotLoop(user.id)
  }, [user?.id, user?.role])

  if (!data) {
    return (
      <div className="p-8 text-center" style={{ color: C.muted }}>
        Đang tải dữ liệu...
      </div>
    )
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: C.paper,
        color: C.ink,
        fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <header
        className="sticky top-0 z-20"
        style={{
          background: 'linear-gradient(160deg, #1E3A8A 0%, #172d77 100%)',
          color: '#fff',
          paddingTop: 'env(safe-area-inset-top)',
          boxShadow: 'var(--shadow-header)',
        }}
      >
        <div className="flex h-14 items-center gap-1.5 overflow-x-auto px-2 sm:gap-2.5 sm:px-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-black tracking-wider shrink-0"
              style={{
                background: C.gold,
                color: '#1C0F00',
                boxShadow: '0 2px 8px 0 rgb(245 158 11 / 0.35)',
              }}
            >
              EDU
            </div>
            <div className="hidden sm:block">
              <div className="text-xs uppercase tracking-widest" style={{ color: 'rgb(255 255 255 / 0.50)' }}>
                Trung tâm Anh ngữ
              </div>
              <div className="text-sm font-black leading-tight" style={{ color: '#fff' }}>
                Hệ thống quản lý chất lượng
              </div>
            </div>
          </div>

          <select
            value={currentClassIndex}
            onChange={(x) => setCurrentClass(Number(x.target.value))}
            className="ml-auto min-w-0 flex-1 truncate rounded-xl px-2 py-2 text-xs font-bold sm:max-w-[220px] sm:flex-none sm:px-3 sm:text-sm"
            style={{ background: 'rgb(255 255 255 / 0.12)', color: '#fff', border: '1px solid rgb(255 255 255 / 0.20)' }}
          >
            {data.classes.map((c, i) => (
              <option key={c.id} value={i} style={{ color: '#000' }}>
                {c.name} · {c.students.length} HS
              </option>
            ))}
          </select>

          {user?.role === 'student' ? (
            <button
              onClick={() => navigate('/app/join')}
              className="shrink-0 rounded-xl px-2.5 py-2 text-sm font-bold transition-all hover:brightness-[0.92] active:scale-[0.97] sm:px-3"
              style={{ background: C.gold, color: '#2A1F05', boxShadow: '0 1px 4px 0 rgb(245 158 11 / 0.30)' }}
              title="Tham gia lớp"
            >
              +<span className="hidden sm:inline"> Tham gia lớp</span>
            </button>
          ) : (
            <button
              onClick={() => setTab('classes')}
              className="shrink-0 rounded-xl px-2.5 py-2 text-sm font-bold transition-all hover:brightness-[0.92] active:scale-[0.97] sm:px-3"
              style={{ background: C.gold, color: '#2A1F05', boxShadow: '0 1px 4px 0 rgb(245 158 11 / 0.30)' }}
              title="Thêm lớp"
            >
              +<span className="hidden sm:inline"> Thêm lớp</span>
            </button>
          )}

          {saving && <span className="hidden text-xs sm:inline" style={{ color: 'rgb(255 255 255 / 0.55)' }}>{saving}</span>}

          {user && <NotificationBell />}
          {user && (user.role === 'teacher' || user.role === 'admin') && <SystemLogBell />}

          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="shrink-0 rounded-xl px-2 py-1.5 text-xs font-bold transition-all hover:brightness-[0.92] sm:px-3"
              style={{ background: C.gold, color: '#2A1F05' }}
              title="Admin"
            >
              <span className="sm:hidden">⚙</span>
              <span className="hidden sm:inline">Admin</span>
            </button>
          )}

          {user && (
            <div
              className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 sm:px-3"
              style={{ background: 'rgb(255 255 255 / 0.10)', border: '1px solid rgb(255 255 255 / 0.12)' }}
            >
              <button
                onClick={() => setProfileOpen(true)}
                className="hidden text-right hover:opacity-80 transition sm:block"
                title="Xem hồ sơ"
              >
                <div className="text-xs font-bold leading-tight">
                  {user.avatar ? `${user.avatar} ` : ''}{user.name}
                </div>
                <div className="text-xs" style={{ color: 'rgb(255 255 255 / 0.55)' }}>
                  {ROLE_LABELS[user.role]}
                </div>
              </button>
              <button
                onClick={() => setProfileOpen(true)}
                className="text-base sm:hidden"
                title="Xem hồ sơ"
              >
                {user.avatar || '👤'}
              </button>
              <div className="hidden sm:block" style={{ width: 1, height: 24, background: 'rgb(255 255 255 / 0.15)' }} />
              <button
                onClick={() => logout()}
                className="rounded-lg border px-2 py-1 text-xs font-semibold transition-all hover:brightness-125 active:scale-[0.94] sm:px-2"
                style={{
                  color: 'rgb(255 255 255 / 0.75)',
                  background: 'rgb(255 255 255 / 0.08)',
                  borderColor: 'rgb(255 255 255 / 0.20)',
                }}
                title="Đăng xuất — lần sau cần đăng nhập lại. Chỉ muốn đóng app mà vẫn nhớ đăng nhập thì đóng tab/trình duyệt, đừng bấm nút này."
              >
                <span className="text-base sm:hidden">→</span>
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {canInstall && (
        <div
          className="flex items-center justify-between px-4 py-2 text-sm"
          style={{ background: C.gold, color: '#2A1F05' }}
        >
          <span>📲 Cài app để dùng nhanh hơn!</span>
          <button
            onClick={install}
            className="rounded-lg px-3 py-1 text-xs font-bold"
            style={{ background: '#2A1F05', color: C.gold }}
          >
            Cài ngay
          </button>
        </div>
      )}

      <div className="flex">
        <Sidebar tabs={TABS} activeTab={activeTab} onTabChange={setTab} />

        <main className="mx-auto min-w-0 max-w-5xl flex-1 p-4 pb-24 sm:pb-4">
        <Suspense fallback={<TabLoading />}>
        {activeTab === 'dashboard' && (
          <DashboardScreen data={data} setTab={setTab} setCurrent={setCurrentClass} />
        )}
        {/* "Chấm bằng AI" tạm ẩn — xem ghi chú ở ALL_TABS phía trên. */}
        {cls && activeTab === 'entry' && (
          // key={cls.id} on every class-scoped screen: without it, switching
          // class kept the previous class's "current student" index — Lớp 10
          // (10 HS) opened at index 12 from Lớp 7 showed no student, "Buổi 1
          // — chưa có" and no entry form (real report 20/10).
          <EntryScreen
            key={cls.id}
            cls={cls}
            update={updateClass}
            teacherName={user?.name}
            initialTarget={entryJumpTarget}
            onConsumeInitialTarget={() => setEntryJumpTarget(null)}
          />
        )}
        {cls && activeTab === 'homework' && <HomeworkScreen key={cls.id} cls={cls} />}
        {cls && activeTab === 'debts' && <DebtScreen key={cls.id} cls={cls} />}
        {activeTab === 'my-scores' && <StudentPortalScreen />}
        {activeTab === 'my-homework' && <StudentHomeworkScreen />}
        {activeTab === 'my-debts' && <StudentDebtScreen />}
        {cls && activeTab === 'board' && <LeaderboardScreen key={cls.id} cls={cls} update={updateClass} userId={user?.role === 'student' ? user.id : undefined} />}
        {cls && activeTab === 'report' && <ReportScreen key={cls.id} cls={cls} update={updateClass} />}
        {cls && activeTab === 'tuition-report' && <TuitionReportScreen key={cls.id} cls={cls} update={updateClass} />}
        {cls && activeTab === 'billing' && (
          <SessionCountScreen
            key={cls.id}
            cls={cls}
            update={updateClass}
            onEditInEntry={(studentId, no) => { setEntryJumpTarget({ studentId, no }); setTab('entry') }}
          />
        )}
        {cls && activeTab === 'parent' && <ParentScreen key={cls.id} cls={cls} />}
        {cls && activeTab === 'student' && <StudentScreen key={cls.id} cls={cls} />}
        {activeTab === 'classes' && (
          <ClassesScreen
            data={data}
            setData={setData}
            current={currentClassIndex}
            setCurrent={setCurrentClass}
          />
        )}
        {activeTab === 'learn' && <LearnScreen />}
        {activeTab === 'notifications' && <NotificationsPage />}
        {activeTab === 'my-child' && <ParentPortalScreen />}
        </Suspense>

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
          <span className="mr-auto">
            Dữ liệu lưu tự động trên thiết bị của bạn. Nên xuất file sao lưu cuối mỗi tháng.
          </span>
          <Btn onClick={exportData}>Xuất file sao lưu</Btn>
          <Btn
            onClick={async () => {
              const { exportFullBackupXlsx } = await import('@/utils/excel')
              exportFullBackupXlsx(data)
            }}
          >
            📊 Xuất Excel
          </Btn>
          <Btn onClick={() => fileRef.current?.click()}>Nhập lại từ file</Btn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(x) => {
              const file = x.target.files?.[0]
              if (file) importData(file)
              x.target.value = ''
            }}
          />
          <button
            onClick={() => {
              if (confirm('Xóa toàn bộ dữ liệu và bắt đầu lại?')) resetData()
            }}
            style={{ color: C.red }}
          >
            Xóa toàn bộ
          </button>
        </div>
        </main>
      </div>

      <BottomNav
        primaryTabs={mobilePrimary}
        overflowTabs={mobileOverflow}
        activeTab={activeTab}
        onTabChange={setTab}
      />

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      <ToastContainer />
    </div>
  )
}
