import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { produce } from 'immer'
import { Btn } from '@/components/atoms/Btn'
import { C } from '@/constants/colors'
import { ROLE_LABELS } from '@/types/auth'
import { ClassesScreen } from '@/features/classes/ClassesScreen'
import { DashboardScreen } from '@/features/dashboard/DashboardScreen'
import { EntryScreen } from '@/features/entry/EntryScreen'
import { LeaderboardScreen } from '@/features/leaderboard/LeaderboardScreen'
import { LearnScreen } from '@/features/learn/LearnScreen'
import { NotificationsPage } from '@/features/notifications/NotificationsPage'
import { ParentPortalScreen } from '@/features/parent/ParentPortalScreen'
import { ProfileModal } from '@/features/profile/ProfileModal'
import { ParentScreen } from '@/features/parent/ParentScreen'
import { ReportScreen } from '@/features/report/ReportScreen'
import { StudentScreen } from '@/features/student/StudentScreen'
import { NotificationBell } from '@/components/molecules/NotificationBell'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { useClassStudents, usePwaInstall } from '@/hooks'
import { isMongoid } from '@/utils/mongoid'
import { emptyEntry } from '@/business/seed'
import type { AppData } from '@/types'

const ALL_TABS = [
  { key: 'dashboard', label: 'Tổng quan', icon: '📋', roles: ['teacher', 'admin'] },
  { key: 'entry', label: 'Nhập điểm', icon: '✏️', roles: ['teacher', 'admin'] },
  { key: 'board', label: 'Xếp hạng', icon: '🏆', roles: ['teacher', 'admin', 'student'] },
  { key: 'report', label: 'Báo cáo', icon: '📊', roles: ['teacher', 'admin'] },
  { key: 'parent', label: 'Phụ huynh', icon: '👨‍👩‍👧', roles: ['teacher', 'admin'] },
  { key: 'student', label: 'Học sinh', icon: '🎓', roles: ['teacher', 'admin'] },
  { key: 'classes', label: 'Lớp học', icon: '🏫', roles: ['teacher', 'admin'] },
  { key: 'learn', label: 'Học tập', icon: '📚', roles: ['teacher', 'admin', 'student'] },
  { key: 'notifications', label: 'Thông báo', icon: '🔔', roles: ['teacher', 'admin', 'student'] },
  { key: 'my-child', label: 'Con tôi', icon: '👶', roles: ['parent'] },
]

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

  useEffect(() => { init() }, [init])

  const cls = data?.classes[currentClassIndex]

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
          localCls.students.push({ id: apiSt._id, name: apiSt.name })
          localCls.sessions.forEach((session) => {
            if (!session.entries[apiSt._id]) {
              session.entries[apiSt._id] = emptyEntry()
            }
          })
        }
      })
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiStudentsKey, currentClassIndex])

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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;800;900&display=swap');`}</style>

      <header style={{ background: C.board, color: '#fff', paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:block">
              <div className="text-xs uppercase tracking-widest opacity-60">Trung tâm Anh ngữ</div>
              <div className="text-lg font-black leading-tight">
                Hệ thống quản lý chất lượng học tập
              </div>
            </div>
            <div className="text-base font-black sm:hidden">LMS ⭐</div>

            <select
              value={currentClassIndex}
              onChange={(x) => setCurrentClass(Number(x.target.value))}
              className="ml-auto rounded-xl px-3 py-2 text-sm font-bold"
              style={{ background: '#ffffff1a', color: '#fff', border: '1px solid #ffffff33' }}
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
                className="rounded-xl px-3 py-2 text-sm font-bold"
                style={{ background: C.gold, color: '#2A1F05' }}
              >
                + Tham gia lớp
              </button>
            ) : (
              <button
                onClick={() => setTab('classes')}
                className="rounded-xl px-3 py-2 text-sm font-bold"
                style={{ background: C.gold, color: '#2A1F05' }}
              >
                + Thêm lớp
              </button>
            )}
            <span className="text-xs opacity-70">{saving}</span>

            {user && <NotificationBell />}

            {user?.role === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="rounded-xl px-3 py-1.5 text-xs font-bold"
                style={{ background: C.gold, color: '#2A1F05' }}
              >
                Admin
              </button>
            )}

            {user && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: '#ffffff14' }}>
                <button
                  onClick={() => setProfileOpen(true)}
                  className="text-right hover:opacity-80 transition"
                  title="Xem hồ sơ"
                >
                  <div className="text-xs font-bold leading-tight">
                    {user.avatar ? `${user.avatar} ` : ''}{user.name}
                  </div>
                  <div className="text-xs opacity-60">{ROLE_LABELS[user.role]}</div>
                </button>
                <button
                  onClick={() => logout()}
                  className="rounded-lg px-2 py-1 text-xs font-semibold opacity-70 transition hover:opacity-100"
                  style={{ background: '#ffffff20', color: '#fff' }}
                  title="Đăng xuất"
                >
                  Thoát
                </button>
              </div>
            )}
          </div>

          {/* Desktop tabs */}
          <nav className="mt-3 hidden gap-1 pb-1 sm:flex">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{
                  background: activeTab === t.key ? C.gold : 'transparent',
                  color: activeTab === t.key ? '#2A1F05' : '#ffffffcc',
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Mobile tabs — horizontal scroll */}
          <div className="mt-2 -mx-4 overflow-x-auto sm:hidden">
            <nav className="flex gap-1 px-4 pb-1" style={{ width: 'max-content' }}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex flex-col items-center gap-0.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: activeTab === t.key ? C.gold : 'transparent',
                    color: activeTab === t.key ? '#2A1F05' : '#ffffffcc',
                  }}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
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

      <main className="mx-auto max-w-6xl p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {activeTab === 'dashboard' && (
          <DashboardScreen data={data} setTab={setTab} setCurrent={setCurrentClass} />
        )}
        {cls && activeTab === 'entry' && <EntryScreen cls={cls} update={updateClass} />}
        {cls && activeTab === 'board' && <LeaderboardScreen cls={cls} update={updateClass} userId={user?.role === 'student' ? user.id : undefined} />}
        {cls && activeTab === 'report' && <ReportScreen cls={cls} update={updateClass} />}
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
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
