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
  solid: { background: C.board, color: '#fff', border: `1px solid ${C.board}` },
  ghost: { background: '#fff', color: C.ink, border: `1px solid ${C.line}` },
  gold: { background: C.gold, color: '#2A1F05', border: `1px solid ${C.gold}` },
}

export function Btn({ children, onClick, kind = 'ghost', className = '', title, disabled }: BtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={'rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ' + className}
      style={STYLES[kind]}
    >
      {children}
    </button>
  )
}
