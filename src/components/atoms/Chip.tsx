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
        // Trạng thái "đã chọn" trước đây chỉ tô màu nhạt (18% opacity), khó
        // nhận ra ngay từ xa/trên di động — đổi thành nền ĐẶC màu, chữ trắng,
        // giống hệt độ nổi bật của atom Pick, để thấy rõ cái nào đã bấm.
        background: on ? color : '#F8FAFC',
        color: on ? '#fff' : C.muted,
        border: `1.5px solid ${on ? color : C.line}`,
        fontWeight: on ? 600 : 400,
        boxShadow: on ? `0 1px 3px 0 ${color}40` : 'none',
      }}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  )
}
