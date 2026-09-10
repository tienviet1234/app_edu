import { C } from '@/constants/colors'
import { useToastStore } from '@/store/toastStore'
import type { ToastType } from '@/store/toastStore'

const STYLE: Record<ToastType, { bg: string; fg: string; icon: string }> = {
  success: { bg: C.emerald, fg: '#fff', icon: '✓' },
  error: { bg: C.rose, fg: '#fff', icon: '⚠' },
  info: { bg: C.board, fg: '#fff', icon: 'ℹ' },
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (!toasts.length) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-20 sm:items-end sm:pb-4 sm:pr-4"
      style={{ pointerEvents: 'none' }}
    >
      {toasts.map((t) => {
        const s = STYLE[t.type]
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="animate-slide-up flex max-w-sm items-center gap-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold shadow-lg"
            style={{ background: s.bg, color: s.fg, pointerEvents: 'auto' }}
          >
            <span className="shrink-0">{s.icon}</span>
            <span className="min-w-0">{t.message}</span>
          </button>
        )
      })}
    </div>
  )
}
