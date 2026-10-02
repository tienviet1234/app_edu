import { useState } from 'react'
import { C } from '@/constants/colors'
import { useUnreadCount } from '@/hooks/useNotifications'

export interface BottomNavTab {
  key: string
  label: string
  icon: string
  /** Số lượng cần chú ý (VD khoản học phí đang nợ) — hiện chấm đỏ NHÁY cạnh icon. */
  badge?: number
}

interface BottomNavProps {
  primaryTabs: BottomNavTab[]   // tối đa 4
  overflowTabs: BottomNavTab[]  // hiện trong sheet "Thêm"
  activeTab: string
  onTabChange: (key: string) => void
}

export function BottomNav({ primaryTabs, overflowTabs, activeTab, onTabChange }: BottomNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { data: notifCount = 0 } = useUnreadCount()

  const hasOverflow = overflowTabs.length > 0
  const overflowActive = hasOverflow && overflowTabs.some((t) => t.key === activeTab)

  function badgeCountFor(t: BottomNavTab): number {
    if (t.key === 'notifications') return notifCount
    return t.badge ?? 0
  }
  const overflowBadgeCount = overflowTabs.reduce((sum, t) => sum + badgeCountFor(t), 0)

  function selectOverflow(key: string) {
    onTabChange(key)
    setSheetOpen(false)
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex sm:hidden"
        style={{
          background: '#fff',
          borderTop: `1px solid ${C.line}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {primaryTabs.map((t) => {
          const active = activeTab === t.key
          const count = badgeCountFor(t)
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold"
              style={{
                color: active ? C.board : C.muted,
                borderTop: active ? `2px solid ${C.gold}` : '2px solid transparent',
              }}
            >
              <span className="relative text-lg leading-none">
                {t.icon}
                {count > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1 h-2 w-2 animate-pulse rounded-full"
                    style={{ background: C.red, boxShadow: '0 0 0 2px #fff' }}
                  />
                )}
              </span>
              <span>{t.label}</span>
            </button>
          )
        })}

        {hasOverflow && (
          <button
            onClick={() => setSheetOpen(true)}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold"
            style={{
              color: overflowActive ? C.board : C.muted,
              borderTop: overflowActive ? `2px solid ${C.gold}` : '2px solid transparent',
            }}
          >
            <span className="relative text-lg leading-none">
              ☰
              {overflowBadgeCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1 h-2 w-2 animate-pulse rounded-full"
                  style={{ background: C.red, boxShadow: '0 0 0 2px #fff' }}
                />
              )}
            </span>
            <span>Thêm</span>
          </button>
        )}
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgb(0 0 0 / 0.4)' }} />
          <div
            className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-2xl p-3"
            style={{ background: '#fff', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: C.line }} />
            <div className="grid grid-cols-4 gap-2">
              {overflowTabs.map((t) => {
                const active = activeTab === t.key
                const count = badgeCountFor(t)
                return (
                  <button
                    key={t.key}
                    onClick={() => selectOverflow(t.key)}
                    className="relative flex flex-col items-center gap-1 rounded-xl py-3 text-xs font-semibold"
                    style={{ background: active ? C.board2 + '12' : C.paper, color: active ? C.board : C.muted }}
                  >
                    <span className="relative text-xl leading-none">
                      {t.icon}
                      {count > 0 && (
                        <span
                          className="absolute -right-1.5 -top-1 h-2 w-2 animate-pulse rounded-full"
                          style={{ background: C.red, boxShadow: '0 0 0 2px #fff' }}
                        />
                      )}
                    </span>
                    <span>{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
