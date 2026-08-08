import { C } from '@/constants/colors'

type PickTone = 'good' | 'bad' | 'neutral'

interface PickProps {
  on?: boolean
  onClick?: () => void
  children: React.ReactNode
  tone?: PickTone
  size?: 'sm' | 'md'
}

export function Pick({ on, onClick, children, tone = 'neutral', size = 'md' }: PickProps) {
  const color = tone === 'good' ? C.board2 : tone === 'bad' ? C.red : C.board
  return (
    <button
      onClick={onClick}
      className={
        'rounded-xl font-semibold transition active:scale-95 ' +
        (size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm')
      }
      style={{
        background: on ? color : '#fff',
        color: on ? '#fff' : C.ink,
        border: `1px solid ${on ? color : C.line}`,
      }}
    >
      {children}
    </button>
  )
}
