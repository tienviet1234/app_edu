import type { StudentStats } from '@/types'
import { round1 } from '@/utils/format'

export interface Mission {
  id: string
  icon: string
  label: string
  done: boolean
  progress: string
}

export function missionsOf(s: StudentStats): Mission[] {
  return [
    {
      id: 'no_absent',
      icon: '🎯',
      label: 'Không nghỉ không phép',
      done: s.counted > 0 && s.absent === 0,
      progress: s.absent > 0 ? `Đã nghỉ ${s.absent} buổi` : s.counted > 0 ? 'Hoàn thành!' : 'Chưa có buổi học',
    },
    {
      id: 'hw_perfect',
      icon: '📚',
      label: 'BTVN hoàn hảo',
      done: s.counted > 0 && s.hwRate >= 100,
      progress: s.counted > 0 ? `${Math.round(s.hwRate)}%` : 'Chưa có dữ liệu',
    },
    {
      id: 'attitude',
      icon: '✋',
      label: 'Thái độ 4+ sao',
      done: s.stars >= 4,
      progress: `${s.stars}/5 sao`,
    },
    {
      id: 'progress',
      icon: '📈',
      label: 'Tiến bộ +5 điểm',
      done: s.progress >= 5,
      progress: s.counted >= 4
        ? (s.progress >= 0 ? `+${round1(s.progress)} điểm` : `${round1(s.progress)} điểm`)
        : 'Cần ít nhất 4 buổi',
    },
    {
      id: 'perfect',
      icon: '💯',
      label: 'Ít nhất 1 buổi điểm max',
      done: s.perfect > 0,
      progress: s.perfect > 0 ? `${s.perfect} buổi tuyệt đối` : 'Chưa đạt',
    },
    {
      id: 'streak3',
      icon: '🔥',
      label: 'Chuỗi có mặt 3+ buổi',
      done: s.streak >= 3,
      progress: `Chuỗi tốt nhất: ${s.streak} buổi`,
    },
  ]
}

export const AVATARS = [
  '🦁','🐯','🐻','🐼','🐨','🦊','🐸','🦋',
  '🐙','🦄','🐉','🦅','🌟','⚡','🎯','🏆',
  '🌈','🎸','🚀','🎭','🍀','🔥','🌊','🎨',
]

export function defaultAvatar(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATARS[h % AVATARS.length]
}
