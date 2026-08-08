import { C } from '@/constants/colors'

interface ExpBarProps {
  value: number
  max?: number
  color?: string
}

const SEGMENTS = 15

export function ExpBar({ value, max = 150, color = C.board2 }: ExpBarProps) {
  const filled = Math.round((value / max) * SEGMENTS)
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-sm"
          style={{ background: i < filled ? color : C.line }}
        />
      ))}
    </div>
  )
}
