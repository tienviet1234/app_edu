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
import { useClasses, useClassStudents, useSessions, useClassScores, usePwaInstall } from '@/hooks'
import { isMongoid } from '@/utils/mongoid'
import { emptyEntry } from '@/business/seed'
import { autoLevel, getClassRubric } from '@/constants/rubrics'
import { rescaleComp, sessionScore } from '@/business/scoring'
import { sessionService } from '@/services/sessions'
import { scoreService } from '@/services/scores'
import { toast } from '@/store/toastStore'
import type { AppData, ClassData, SessionEntry } from '@/types'

// Các màn theo tab tách thành chunk riêng, chỉ tải khi thực sự mở tab đó —
// trước đây tất cả (kể cả recharts ở Dashboard/Report/Leaderboard, xlsx ở
// ClassesScreen...) bị gộp chung 1 file JS ~1.6MB dù chỉ dùng 1 tab/lần.
const SessionCountScreen = lazy(() =>
  import('@/features/billing/SessionCountScreen').then((m) => ({ default: m.SessionCountScreen })))
const ClassesScreen = lazy(() =>
  import('@/features/classes/ClassesScreen').then((m) => ({ default: m.ClassesScreen })))
const DashboardScreen = lazy(() =>
  import('@/features/dashboard/DashboardScreen').then((m) => ({ default: m.DashboardScreen })))
const EntryScreen = lazy(() =>
  import('@/features/entry/EntryScreen').then((m) => ({ default: m.EntryScreen })))
const HomeworkScreen = lazy(() =>
  import('@/features/entry/HomeworkScreen').then((m) => ({ default: m.HomeworkScreen })))
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
  { key: 'homework', label: 'Bài tập', icon: '📝', roles: ['teacher', 'admin'] },
  { key: 'my-scores', label: 'Điểm của tôi', icon: '📊', roles: ['student'] },
  { key: 'my-homework', label: 'Bài tập của tôi', icon: '📝', roles: ['student'] },
  { key: 'board', label: 'Xếp hạng', icon: '🏆', roles: ['teacher', 'admin', 'student'] },
  { key: 'report', label: 'Báo cáo', icon: '📊', roles: ['teacher', 'admin'] },
  { key: 'billing', label: 'Thống kê buổi', icon: '📅', roles: ['teacher', 'admin'] },
  { key: 'parent', label: 'Phụ huynh', icon: '👨‍👩‍👧', roles: ['teacher', 'admin'] },
  { key: 'student', label: 'Học sinh', icon: '🎓', roles: ['teacher', 'admin'] },
  { key: 'classes', label: 'Lớp học', icon: '🏫', roles: ['teacher', 'admin'] },
  { key: 'learn', label: 'Học tập', icon: '📚', roles: ['teacher', 'admin', 'student'] },
  { key: 'notifications', label: 'Thông báo', icon: '🔔', roles: ['teacher', 'admin', 'student'] },
  { key: 'my-child', label: 'Con tôi', icon: '👶', roles: ['parent'] },
]

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
  interface Job {
    classId: string
    studentId: string
    sessionLocalId: string
    no: number
    date: string
    entry: SessionEntry
    total: number
  }
  const jobs: Job[] = []
  classes.forEach((c) => {
    if (!isMongoid(c.id)) return
    const r = getClassRubric(c)
    c.students.forEach((stu) => {
      if (!isMongoid(stu.id)) return
      stu.sessions.forEach((s) => {
        if (isMongoid(s.id)) return // đã từng lên server rồi, không cần đẩy lại
        const maxes = s.maxes ?? {}
        const comps = r.comps.map((comp) => (maxes[comp.key] != null ? rescaleComp(comp, maxes[comp.key]) : comp))
        const total = sessionScore(s.entry, { ...r, comps })
        if (total === null) return // buổi trống, chưa nhập gì — không có gì để đẩy
        jobs.push({ classId: c.id, studentId: stu.id, sessionLocalId: s.id, no: s.no, date: s.date, entry: s.entry, total })
      })
    })
  })
  if (!jobs.length) return

  let ok = 0
  let fail = 0
  for (const job of jobs) {
    try {
      const apiSession = await sessionService.create({
        classId: job.classId,
        studentId: job.studentId,
        title: `Buổi ${job.no}`,
        lessonNo: job.no,
        scheduledAt: `${job.date}T00:00:00.000Z`,
      })
      await scoreService.upsert({
        classId: job.classId, sessionId: apiSession._id, studentId: job.studentId,
        ...job.entry, total: job.total,
      })
      setData(produce((d: AppData) => {
        const cls2 = d.classes.find((c) => c.id === job.classId)
        const stu2 = cls2?.students.find((s) => s.id === job.studentId)
        const ss2 = stu2?.sessions.find((s) => s.id === job.sessionLocalId)
        if (ss2) ss2.id = apiSession._id
      }))
      ok++
    } catch {
      fail++
    }
  }
  if (ok > 0) {
    toast.success(`Đã tự động đồng bộ ${ok} buổi học còn thiếu lên server`)
  }
  if (fail > 0) {
    toast.error(`${fail} buổi chưa đồng bộ được (lỗi mạng) — thử mở lại app sau`, { persist: true })
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
    init, setData, setCurrentClass, setTab, updateClass,
    exportData, importData, resetData,
  } = useAppStore()
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { canInstall, install } = usePwaInstall()
  const [profileOpen, setProfileOpen] = useState(false)
  // Nhảy từ "Thống kê buổi" sang "Nhập điểm" đúng học sinh + đúng buổi để sửa
  // điểm — giáo viên và admin đều thao tác được, không giới hạn riêng ai.
  const [entryJumpTarget, setEntryJumpTarget] = useState<{ studentId: string; no: number } | null>(null)

  const TABS = ALL_TABS.filter((t) => !user || t.roles.includes(user.role))
  const { primary: mobilePrimary, overflow: mobileOverflow } = splitMobileTabs(TABS, user?.role)

  // Re-init when user changes so each account gets its own scoped data
  useEffect(() => { init(user?.id) }, [init, user?.id])

  const cls = data?.classes[currentClassIndex]

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
        const teacherName =
          ac.teacherId && typeof ac.teacherId === 'object' && 'name' in ac.teacherId
            ? (ac.teacherId as unknown as { name: string }).name
            : ac.teacherName ?? user?.name ?? ''
        const level = autoLevel(ac.name)
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
  const apiAllClassesRubricKey = apiAllClasses?.items.map((c) => `${c._id}:${c.updatedAt}`).join(',') ?? ''
  useEffect(() => {
    if (!data || !apiAllClasses?.items.length) return
    const RUBRIC_FIELDS = ['hiddenComps', 'extraComps', 'compOverrides', 'compLabelOverrides'] as const
    const changedIds = new Set(
      apiAllClasses.items
        .filter((ac) => {
          const localCls = data.classes.find((c) => c.id === ac._id)
          if (!localCls) return false
          return RUBRIC_FIELDS.some((f) => JSON.stringify(localCls[f] ?? null) !== JSON.stringify(ac[f] ?? null))
        })
        .map((ac) => ac._id),
    )
    if (!changedIds.size) return
    setData(produce((d: AppData) => {
      d.classes.forEach((localCls) => {
        if (!changedIds.has(localCls.id)) return
        const ac = apiAllClasses.items.find((x) => x._id === localCls.id)!
        localCls.hiddenComps = ac.hiddenComps
        localCls.extraComps = ac.extraComps
        localCls.compOverrides = ac.compOverrides
        localCls.compLabelOverrides = ac.compLabelOverrides
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
      apiStudents.forEach((apiSt) => {
        const existing = localCls.students.find((s) => s.id === apiSt._id)
        if (existing) {
          existing.name = apiSt.name
          if (apiSt.avatar) existing.avatar = apiSt.avatar
        } else {
          localCls.students.push({ id: apiSt._id, name: apiSt.name, avatar: apiSt.avatar, sessions: [] })
        }
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiStudentsKey, currentClassIndex])

  // Sync per-student sessions + scores from server into local store — fills in
  // sessions that don't exist locally yet (e.g. opening this class on a device
  // for the first time), never touches sessions already present locally.
  // Restricted to teacher/admin: scores.list returns the WHOLE class's scores,
  // which must never land in a student/parent's local storage.
  const canSyncWholeClass = user?.role === 'teacher' || user?.role === 'admin'
  const syncClassId = canSyncWholeClass && cls && isMongoid(cls.id) ? cls.id : ''
  const { data: apiSessions } = useSessions(syncClassId)
  const { data: apiScores } = useClassScores(syncClassId)
  const apiSessionsKey = apiSessions?.items.map((s) => s._id).join(',') ?? ''
  const apiScoresKey = apiScores?.items.map((s) => s._id + s.updatedAt).join(',') ?? ''
  useEffect(() => {
    if (!cls) return
    const perStudentSessions = (apiSessions?.items ?? []).filter((s) => s.studentId)
    const missing = perStudentSessions.filter(
      (as) => !cls.students.some((st) => st.sessions.some((s) => s.id === as._id)),
    )
    if (!missing.length) return

    const scoresBySession = new Map((apiScores?.items ?? []).map((s) => [s.sessionId, s]))

    setData(produce((d: AppData) => {
      const localCls = d.classes[currentClassIndex]
      missing.forEach((as) => {
        const student = localCls.students.find((st) => st.id === as.studentId)
        if (!student) return
        const score = scoresBySession.get(as._id)
        const teacherName = as.createdBy && typeof as.createdBy === 'object' ? as.createdBy.name : undefined
        student.sessions.push({
          id: as._id,
          no: as.lessonNo ?? student.sessions.length + 1,
          date: as.scheduledAt.slice(0, 10),
          homework: '',
          createdByName: teacherName,
          recordedAt: as.createdAt,
          entry: score
            ? {
                attendance: score.attendance,
                scores: score.scores,
                tags: score.tags,
                ticks: score.ticks,
                choice: score.choice,
                parts: score.parts,
                skip: score.skip,
                ev: score.ev as SessionEntry['ev'],
                note: score.note ?? '',
              }
            : emptyEntry(),
        })
        student.sessions.sort((a, b) => a.no - b.no)
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSessionsKey, apiScoresKey, currentClassIndex])

  // Tự động đồng bộ điểm còn kẹt lại máy này lên server — 1 lần mỗi khi mở
  // app (không lặp lại liên tục vì effect chỉ phụ thuộc userId, không phụ
  // thuộc `data` — tránh gọi lại mỗi khi gõ điểm làm `data` đổi liên tục).
  const autoSyncedForRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!data || !user) return
    if (user.role !== 'teacher' && user.role !== 'admin') return
    if (autoSyncedForRef.current === user.id) return
    autoSyncedForRef.current = user.id
    void autoSyncStrandedScores(data.classes, setData)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data, user?.id])

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
                title="Đăng xuất"
              >
                <span className="text-base sm:hidden">→</span>
                <span className="hidden sm:inline">Thoát</span>
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
        {cls && activeTab === 'entry' && (
          <EntryScreen
            cls={cls}
            update={updateClass}
            teacherName={user?.name}
            initialTarget={entryJumpTarget}
            onConsumeInitialTarget={() => setEntryJumpTarget(null)}
          />
        )}
        {cls && activeTab === 'homework' && <HomeworkScreen cls={cls} />}
        {activeTab === 'my-scores' && <StudentPortalScreen />}
        {activeTab === 'my-homework' && <StudentHomeworkScreen />}
        {cls && activeTab === 'board' && <LeaderboardScreen cls={cls} update={updateClass} userId={user?.role === 'student' ? user.id : undefined} />}
        {cls && activeTab === 'report' && <ReportScreen cls={cls} update={updateClass} />}
        {cls && activeTab === 'billing' && (
          <SessionCountScreen
            cls={cls}
            update={updateClass}
            onEditInEntry={(studentId, no) => { setEntryJumpTarget({ studentId, no }); setTab('entry') }}
          />
        )}
        {cls && activeTab === 'parent' && <ParentScreen cls={cls} />}
        {cls && activeTab === 'student' && <StudentScreen cls={cls} />}
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
