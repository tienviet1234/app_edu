import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'

export interface SidebarTab {
  key: string
  label: string
  icon: string
  /** Số lượng cần chú ý (VD khoản học phí đang nợ) — hiện chấm đỏ NHÁY
   *  (animate-pulse) cạnh icon để dễ nhận ra ngay, không cần mở tab mới biết. */
  badge?: number
}

interface SidebarProps {
  tabs: SidebarTab[]
  activeTab: string
  onTabChange: (key: string) => void
}

export function Sidebar({ tabs, activeTab, onTabChange }: SidebarProps) {
  // Mặc định thu gọn trên sm–md, mở rộng trên lg (≥1024px) — theo dõi 1 lần lúc mount
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    setCollapsed(window.innerWidth < 1024)
  }, [])

  return (
    <aside
      className="sticky top-14 hidden shrink-0 self-start overflow-hidden sm:block"
      style={{
        width: collapsed ? 64 : 224,
        height: 'calc(100vh - 56px)',
        background: '#fff',
        borderRight: `1px solid ${C.line}`,
        transition: 'width var(--transition-base)',
      }}
    >
      <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
        {tabs.map((t) => {
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              title={collapsed ? (t.badge ? `${t.label} (${t.badge})` : t.label) : undefined}
              className="relative flex items-center gap-3 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-all"
              style={{
                background: active ? C.board2 + '15' : 'transparent',
                color: active ? C.board : C.muted,
                borderLeft: active ? `3px solid ${C.board2}` : '3px solid transparent',
              }}
            >
              <span className="relative shrink-0 text-lg leading-none">
                {t.icon}
                {!!t.badge && (
                  <span
                    className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 animate-pulse rounded-full"
                    style={{ background: C.red, boxShadow: '0 0 0 2px #fff' }}
                  />
                )}
              </span>
              <span
                className="flex flex-1 items-center justify-between gap-1"
                style={{
                  opacity: collapsed ? 0 : 1,
                  transition: `opacity var(--transition-base) ${collapsed ? '0ms' : '100ms'}`,
                }}
              >
                {t.label}
                {!!t.badge && (
                  <span
                    className="animate-pulse rounded-full px-1.5 text-[10px] font-bold text-white"
                    style={{ background: C.red }}
                  >
                    {t.badge > 9 ? '9+' : t.badge}
                  </span>
                )}
              </span>
            </button>
          )
        })}

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-auto flex items-center justify-center rounded-xl py-2 text-sm font-bold"
          style={{ color: C.muted, background: C.paper }}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </nav>
    </aside>
  )
}
