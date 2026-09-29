import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'
import { Icon, TAB_ICON } from '@/components/atoms/Icon'

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
        background: C.card,
        borderRight: `1.5px solid ${C.line}`,
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
              className="flex min-h-11 items-center gap-3 whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-semibold transition-all"
              style={{
                background: active ? C.board2 + '12' : 'transparent',
                color: active ? C.board : C.muted,
                borderLeft: active ? `4px solid ${C.board2}` : '4px solid transparent',
              }}
            >
              <span className="shrink-0"><Icon name={TAB_ICON[t.key] ?? 'list'} size={20} /></span>
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
          className="mt-auto flex min-h-11 items-center justify-center rounded-md py-2 text-sm font-bold"
          style={{ color: C.muted, background: C.paper }}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </nav>
    </aside>
  )
}
