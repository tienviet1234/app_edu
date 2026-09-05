import { C } from '@/constants/colors'

interface ChipProps {
  on?: boolean
  onClick?: () => void
  children: React.ReactNode
  tone?: 'err' | 'good'
}

export function Chip({ on, onClick, children, tone = 'err' }: ChipProps) {
  const color = tone === 'good' ? C.board2 : C.red
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] hover:brightness-[0.93]"
      style={{
        background: on ? color + '18' : '#F8FAFC',
        color: on ? color : C.muted,
        border: `1.5px solid ${on ? color + '66' : C.line}`,
        fontWeight: on ? 600 : 400,
      }}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}
