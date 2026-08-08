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
      className="rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95"
      style={{
        background: on ? color + '1A' : '#fff',
        color: on ? color : C.muted,
        border: `1px solid ${on ? color : C.line}`,
      }}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}
