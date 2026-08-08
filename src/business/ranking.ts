import type { ClassData, RankingEntry } from '@/types'
import { statsOf } from './stats'

export function rankingOf(cls: ClassData, to: number | null = null): RankingEntry[] {
  return cls.students
    .map((st) => ({ student: st, s: statsOf(cls, st.id, 0, to) }))
    .sort((a, b) => b.s.monthTotal - a.s.monthTotal || b.s.exp - a.s.exp)
    .map((r, i) => ({ ...r, place: i + 1 }))
}

export function badgesOf(s: ReturnType<typeof statsOf>, place: number): string[] {
  const b: string[] = []
  if (!s.counted) return b
  if (s.absent === 0 && s.excused === 0 && s.late === 0) b.push('🎯 Chuyên cần tuyệt đối')
  if (s.hwRate >= 100) b.push('📚 BTVN hoàn hảo')
  if (s.streak >= 5) b.push('🔥 Chuỗi ' + s.streak + ' buổi')
  if (s.perfect > 0) b.push('💯 Điểm tuyệt đối')
  if (s.progress >= 3) b.push('📈 Tiến bộ vượt bậc')
  if (place <= 3) b.push('🏅 Top 3 lớp')
  if (s.stars >= 5) b.push('✋ Học tích cực')
  return b
}
