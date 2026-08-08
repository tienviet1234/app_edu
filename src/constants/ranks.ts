import type { Rank } from '@/types'

export const RANKS: Rank[] = [
  { min: 95, name: 'Diamond', color: '#3F9BC4' },
  { min: 90, name: 'Platinum', color: '#6E8598' },
  { min: 85, name: 'Gold I', color: '#D9A227' },
  { min: 80, name: 'Gold II', color: '#D9A227' },
  { min: 75, name: 'Gold III', color: '#D9A227' },
  { min: 70, name: 'Silver I', color: '#8D9AA0' },
  { min: 65, name: 'Silver II', color: '#8D9AA0' },
  { min: 60, name: 'Silver III', color: '#8D9AA0' },
  { min: 0, name: 'Bronze', color: '#A9744F' },
]

export const STARS_LABELS = ['Cần cải thiện', 'Cần cải thiện', 'Đạt', 'Đạt', 'Tốt', 'Rất tốt']
