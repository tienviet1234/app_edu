import { C } from '@/constants/colors'

interface ChipProps {
  on?: boolean
  onClick?: () => void
  children: React.ReactNode
  tone?: 'err' | 'good'
  size?: 'sm' | 'md'
}

export function Chip({ on, onClick, children, tone = 'err', size = 'md' }: ChipProps) {
  const color = tone === 'good' ? C.board2 : C.red
  return (
    <button
      onClick={onClick}
      className={
        'rounded-full font-medium transition-all active:scale-[0.97] hover:brightness-[0.93] ' +
        (size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1.5 text-sm')
      }
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
