import { C } from '@/constants/colors'

interface StatProps {
  label: string
  value: string | number
  sub?: string
  color?: string
}

export function Stat({ label, value, sub, color }: StatProps) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: '#fff',
        border: `1px solid ${C.line}`,
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)',
      }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: C.muted }}>
        {label}
      </div>
      <div
        className="mt-0.5 text-2xl font-black tabular"
        style={{ color: color ?? C.ink }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
          {sub}
        </div>
      )}
    </div>
  )
}
