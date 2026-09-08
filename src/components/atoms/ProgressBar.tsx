import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'

interface ProgressBarProps {
  value: number // 0-100
  color?: string
  height?: number
  animated?: boolean
  className?: string
}

export function ProgressBar({ value, color = C.board2, height = 6, animated = false, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const [width, setWidth] = useState(animated ? 0 : clamped)

  useEffect(() => {
    if (!animated) { setWidth(clamped); return }
    const id = requestAnimationFrame(() => setWidth(clamped))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped])

  return (
    <div
      className={'w-full overflow-hidden rounded-full ' + className}
      style={{ height, background: C.line }}
    >
      <div
        style={{
          width: `${width}%`,
          height: '100%',
          background: color,
          borderRadius: 9999,
          transition: 'width 600ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  )
}
