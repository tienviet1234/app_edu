import { C } from '@/constants/colors'

interface ProgressRingProps {
  value: number // 0-100
  color: string
  size?: number
  strokeWidth?: number
  label?: string
  trackColor?: string
}

export function ProgressRing({ value, color, size = 64, strokeWidth = 6, label, trackColor }: ProgressRingProps) {
  const r = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.min(100, Math.max(0, value))
  const offset = circumference * (1 - pct / 100)

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor ?? C.line} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums" style={{ color: C.ink }}>
        {label ?? `${Math.round(pct)}%`}
      </span>
    </div>
  )
}
