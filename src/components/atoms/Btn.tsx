import { C } from '@/constants/colors'

type BtnKind = 'solid' | 'ghost' | 'gold' | 'danger' | 'success' | 'outline-primary'
type BtnSize = 'sm' | 'md' | 'lg'

interface BtnProps {
  children: React.ReactNode
  onClick?: () => void
  kind?: BtnKind
  size?: BtnSize
  loading?: boolean
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
  danger: {
    background: '#FEF2F2',
    color: C.red,
    border: '1px solid #FECACA',
    boxShadow: 'none',
  },
  success: {
    background: '#ECFDF5',
    color: '#059669',
    border: '1px solid #6EE7B7',
    boxShadow: 'none',
  },
  'outline-primary': {
    background: 'transparent',
    color: C.board,
    border: `1px solid ${C.board}`,
    boxShadow: 'none',
  },
}

const SIZE_CLASS: Record<BtnSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

export function Btn({
  children, onClick, kind = 'ghost', size = 'md', loading = false,
  className = '', title, disabled,
}: BtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled || loading}
      className={
        'rounded-xl font-semibold transition-all active:scale-[0.97] disabled:opacity-50 hover:brightness-[0.93] ' +
        SIZE_CLASS[size] + ' ' + className
      }
      style={STYLES[kind]}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
          {children}
        </span>
      ) : children}
    </button>
  )
}
