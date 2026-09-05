import { C } from '@/constants/colors'

type BtnKind = 'solid' | 'ghost' | 'gold'

interface BtnProps {
  children: React.ReactNode
  onClick?: () => void
  kind?: BtnKind
  className?: string
  title?: string
  disabled?: boolean
}

const STYLES: Record<BtnKind, React.CSSProperties> = {
  solid: {
    background: C.board,
    color: '#fff',
    border: `1px solid ${C.board}`,
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.14), 0 1px 2px -1px rgb(0 0 0 / 0.10)',
  },
  ghost: {
    background: '#fff',
    color: C.ink,
    border: `1px solid ${C.line}`,
    boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  },
  gold: {
    background: C.gold,
    color: '#1C0F00',
    border: `1px solid ${C.gold}`,
    boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.14)',
  },
}

export function Btn({ children, onClick, kind = 'ghost', className = '', title, disabled }: BtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        'rounded-xl px-3 py-2 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50 hover:brightness-[0.93] ' +
        className
      }
      style={STYLES[kind]}
    >
      {children}
    </button>
  )
}
