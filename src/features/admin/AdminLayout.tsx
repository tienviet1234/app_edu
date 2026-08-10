import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/constants/colors'
import { useAuthStore } from '@/store/authStore'

const NAV = [
  { key: 'dashboard',  label: 'Tổng quan',         icon: '📊' },
  { key: 'activity',   label: 'Hoạt động',          icon: '📡' },
  { key: 'users',      label: 'Người dùng',         icon: '👥' },
  { key: 'classes',    label: 'Lớp học',             icon: '🏫' },
  { key: 'courses',    label: 'Khóa học',            icon: '📚' },
  { key: 'rubric',     label: 'Tiêu chí chấm',      icon: '✏️' },
  { key: 'analytics',  label: 'Phân tích',           icon: '📈' },
  { key: 'audit',      label: 'Nhật ký hệ thống',   icon: '📋' },
]

interface AdminLayoutProps {
  page: string
  setPage: (p: string) => void
  children: React.ReactNode
}

export function AdminLayout({ page, setPage, children }: AdminLayoutProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.paper }}>
      {/* Top bar */}
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: C.board, color: '#fff', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-1.5 sm:hidden"
          style={{ background: '#ffffff18' }}
        >
          ☰
        </button>
        <div className="font-black text-base leading-tight">
          <span className="opacity-50 text-xs mr-1">ADMIN</span>
          LMS Anh ngữ
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate('/app')}
            className="hidden sm:block rounded-xl px-3 py-1.5 text-xs font-semibold"
            style={{ background: '#ffffff18', color: '#fff' }}
          >
            Quay về App
          </button>
          {user && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: '#ffffff14' }}>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold leading-tight">{user.name}</div>
                <div className="text-xs opacity-50">Quản trị viên</div>
              </div>
              <button
               
               onClick={() => logout()}
                className="rounded-lg px-2 py-1 text-xs font-semibold opacity-70 hover:opacity-100"
                style={{ background: '#ffffff20', color: '#fff' }}
              >
                Thoát
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (desktop) */}
        <aside
          className="hidden sm:flex flex-col w-52 shrink-0 py-4 gap-1"
          style={{ background: C.board, borderRight: `1px solid ${C.board2}` }}
        >
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-left transition"
              style={{
                background: page === n.key ? '#ffffff1a' : 'transparent',
                color: page === n.key ? '#fff' : '#ffffff80',
                borderRight: page === n.key ? `3px solid ${C.gold}` : '3px solid transparent',
              }}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="mt-auto px-4 pt-4">
            <button
              onClick={() => navigate('/app')}
              className="w-full rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ background: '#ffffff14', color: '#ffffff80' }}
            >
              Quay về App giáo viên
            </button>
          </div>
        </aside>

        {/* Mobile nav overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 sm:hidden"
            style={{ background: '#00000060' }}
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="w-56 h-full flex flex-col py-4 gap-1"
              style={{ background: C.board }}
              onClick={(e) => e.stopPropagation()}
            >
              {NAV.map((n) => (
                <button
                  key={n.key}
                  onClick={() => { setPage(n.key); setMobileOpen(false) }}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left"
                  style={{
                    background: page === n.key ? '#ffffff1a' : 'transparent',
                    color: page === n.key ? '#fff' : '#ffffff80',
                  }}
                >
                  <span className="text-base">{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </aside>
          </div>
        )}

        {/* Mobile tab bar */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex" style={{ background: C.board, borderTop: `1px solid ${C.board2}` }}>
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-semibold"
              style={{ color: page === n.key ? C.gold : '#ffffff60' }}
            >
              <span className="text-base">{n.icon}</span>
              <span className="text-[10px]">{n.label}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6"
          style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 56px))' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
