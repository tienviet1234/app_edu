import type { Rank } from '@/types'

interface RankBadgeProps {
  rank: Rank
  small?: boolean
}

export function RankBadge({ rank, small }: RankBadgeProps) {
  return (
    <span
      className={
        'inline-flex items-center rounded-full font-semibold ' +
        (small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm')
      }
      style={{
        background: rank.color + '1F',
        color: rank.color,
        border: `1px solid ${rank.color}55`,
      }}
    >
      {rank.name}
    </span>
  )
}
