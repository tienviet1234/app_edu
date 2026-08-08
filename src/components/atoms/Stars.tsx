import { C } from '@/constants/colors'

interface StarsProps {
  n: number
}

export function Stars({ n }: StarsProps) {
  return (
    <span style={{ color: C.gold, letterSpacing: 1 }}>
      {'★'.repeat(n)}
      <span style={{ color: C.line }}>{'★'.repeat(5 - n)}</span>
    </span>
  )
}
