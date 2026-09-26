import { useState } from 'react'
import { C } from '@/constants/colors'
import { Icon, TAB_ICON } from '@/components/atoms/Icon'
import { useUnreadCount } from '@/hooks/useNotifications'

export interface BottomNavTab {
  key: string
  label: string
  icon: string
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
  const notifInPrimary = primaryTabs.some((t) => t.key === 'notifications')
  const notifInOverflow = overflowTabs.some((t) => t.key === 'notifications')

  function selectOverflow(key: string) {
    onTabChange(key)
    setSheetOpen(false)
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex sm:hidden"
        style={{
          background: C.card,
          borderTop: `1.5px solid ${C.line}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {primaryTabs.map((t) => {
          const active = activeTab === t.key
          const showBadge = t.key === 'notifications' && notifInPrimary && notifCount > 0
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold"
              style={{
                color: active ? C.board : C.muted,
                borderTop: active ? `4px solid ${C.board2}` : '4px solid transparent',
              }}
            >
              <span className="relative leading-none">
                <Icon name={TAB_ICON[t.key] ?? 'list'} size={22} />
                {showBadge && (
                  <span
                    className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full"
                    style={{ background: C.red }}
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
            className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold"
            style={{
              color: overflowActive ? C.board : C.muted,
              borderTop: overflowActive ? `4px solid ${C.board2}` : '4px solid transparent',
            }}
          >
            <span className="relative leading-none">
              <Icon name="menu" size={22} />
              {notifInOverflow && notifCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full"
                  style={{ background: C.red }}
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
            className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-md p-3"
            style={{ background: C.card, borderTop: `4px solid ${C.board2}`, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full" style={{ background: C.line }} />
            <div className="grid grid-cols-4 gap-2">
              {overflowTabs.map((t) => {
                const active = activeTab === t.key
                const showBadge = t.key === 'notifications' && notifCount > 0
                return (
                  <button
                    key={t.key}
                    onClick={() => selectOverflow(t.key)}
                    className="relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-md py-3 text-xs font-semibold"
                    style={{ background: active ? C.board2 + '12' : C.paper, color: active ? C.board : C.muted }}
                  >
                    <span className="relative leading-none">
                      <Icon name={TAB_ICON[t.key] ?? 'list'} size={22} />
                      {showBadge && (
                        <span
                          className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full"
                          style={{ background: C.red }}
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
