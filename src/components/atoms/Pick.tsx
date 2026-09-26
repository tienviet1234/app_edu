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
  const color = tone === 'good' ? C.emerald : tone === 'bad' ? C.red : C.board2
  return (
    <button
      onClick={onClick}
      className={
        // min-h-11 = 44px: vùng chạm tối thiểu cho ngón tay — thầy cô chấm bằng
        // 1 tay giữa giờ dạy, nút thấp hơn dễ chạm nhầm sang mức điểm bên cạnh.
        'min-h-11 rounded-md font-semibold transition-all active:scale-[0.98] hover:brightness-[0.93] ' +
        (size === 'sm' ? 'px-3 text-xs' : 'px-3 text-sm')
      }
      style={{
        background: on ? color : '#fff',
        color: on ? '#fff' : C.muted,
        border: `1.5px solid ${on ? color : C.line}`,
      }}
    >
      {children}
    </button>
  )
}
