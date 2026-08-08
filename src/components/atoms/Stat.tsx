import { C } from '@/constants/colors'

interface StatProps {
  label: string
  value: string | number
  sub?: string
  color?: string
}

export function Stat({ label, value, sub, color }: StatProps) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: C.paper }}>
      <div className="text-xs" style={{ color: C.muted }}>
        {label}
      </div>
      <div
        className="text-xl font-bold"
        style={{ color: color ?? C.ink, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: C.muted }}>
          {sub}
        </div>
      )}
    </div>
  )
}
