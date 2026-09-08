import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'

export interface SidebarTab {
  key: string
  label: string
  icon: string
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
              title={collapsed ? t.label : undefined}
              className="flex items-center gap-3 whitespace-nowrap rounded-xl px-2.5 py-2.5 text-sm font-semibold transition-all"
              style={{
                background: active ? C.board2 + '15' : 'transparent',
                color: active ? C.board : C.muted,
                borderLeft: active ? `3px solid ${C.board2}` : '3px solid transparent',
              }}
            >
              <span className="shrink-0 text-lg leading-none">{t.icon}</span>
              <span
                style={{
                  opacity: collapsed ? 0 : 1,
                  transition: `opacity var(--transition-base) ${collapsed ? '0ms' : '100ms'}`,
                }}
              >
                {t.label}
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
