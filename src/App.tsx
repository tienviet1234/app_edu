import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { produce } from 'immer'
import { Btn } from '@/components/atoms/Btn'
import { C } from '@/constants/colors'
import { ROLE_LABELS } from '@/types/auth'
import { SessionCountScreen } from '@/features/billing/SessionCountScreen'
import { ClassesScreen } from '@/features/classes/ClassesScreen'
import { DashboardScreen } from '@/features/dashboard/DashboardScreen'
import { EntryScreen } from '@/features/entry/EntryScreen'
import { HomeworkScreen } from '@/features/entry/HomeworkScreen'
import { LeaderboardScreen } from '@/features/leaderboard/LeaderboardScreen'
import { LearnScreen } from '@/features/learn/LearnScreen'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { ParentPortalScreen } from '@/features/parent/ParentPortalScreen'
import { ProfileModal } from '@/features/profile/ProfileModal'
import { ParentScreen } from '@/features/parent/ParentScreen'
import { ReportScreen } from '@/features/report/ReportScreen'
import { StudentScreen } from '@/features/student/StudentScreen'
import { StudentPortalScreen } from '@/features/student/StudentPortalScreen'
import { NotificationBell } from '@/components/molecules/NotificationBell'
import { Sidebar } from '@/components/molecules/Sidebar'
import { BottomNav } from '@/components/molecules/BottomNav'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { useClasses, useClassStudents, useSessions, useClassScores, usePwaInstall } from '@/hooks'
import { isMongoid } from '@/utils/mongoid'
import { emptyEntry } from '@/business/seed'
import { autoLevel } from '@/constants/rubrics'
import type { AppData, SessionEntry } from '@/types'

const ALL_TABS = [
  { key: 'dashboard', label: 'Tổng quan', icon: '📋', roles: ['teacher', 'admin'] },
  { key: 'entry', label: 'Nhập điểm', icon: '✏️', roles: ['teacher', 'admin'] },
  { key: 'homework', label: 'Bài tập', icon: '📝', roles: ['teacher', 'admin'] },
  { key: 'my-scores', label: 'Điểm của tôi', icon: '📊', roles: ['student'] },
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

// Ưu tiên hiển thị trực tiếp trên Bottom Nav (mobile) — tối đa 4 tab, còn lại vào "☰ Thêm"
const MOBILE_PRIMARY_KEYS: Record<string, string[]> = {
  teacher: ['dashboard', 'entry', 'board', 'homework'],
  admin: ['dashboard', 'entry', 'board', 'homework'],
  student: ['my-scores', 'board', 'learn', 'notifications'],
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
            : user?.name ?? ''
        const level = autoLevel(ac.name)
        d.classes.push({
          id: ac._id,
          name: ac.name,
          teacher: teacherName,
          level,
          perMonth: level === 'primary' ? 8 : 12,
          students: [],
          comments: {},
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
        } else {
          localCls.students.push({ id: apiSt._id, name: apiSt.name, sessions: [] })
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
        student.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSessionsKey, apiScoresKey, currentClassIndex])

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
        {activeTab === 'dashboard' && (
          <DashboardScreen data={data} setTab={setTab} setCurrent={setCurrentClass} />
        )}
        {cls && activeTab === 'entry' && <EntryScreen cls={cls} update={updateClass} teacherName={user?.name} />}
        {cls && activeTab === 'homework' && <HomeworkScreen cls={cls} />}
        {activeTab === 'my-scores' && <StudentPortalScreen />}
        {cls && activeTab === 'board' && <LeaderboardScreen cls={cls} update={updateClass} userId={user?.role === 'student' ? user.id : undefined} />}
        {cls && activeTab === 'report' && <ReportScreen cls={cls} update={updateClass} />}
        {cls && activeTab === 'billing' && <SessionCountScreen cls={cls} />}
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

        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs" style={{ color: C.muted }}>
          <span className="mr-auto">
            Dữ liệu lưu tự động trên thiết bị của bạn. Nên xuất file sao lưu cuối mỗi tháng.
          </span>
          <Btn onClick={exportData}>Xuất file sao lưu</Btn>
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
    </div>
  )
}
