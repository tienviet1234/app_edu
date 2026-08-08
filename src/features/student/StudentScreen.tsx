import { useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { round1 } from '@/utils/format'
import { rankingOf, badgesOf } from '@/business/ranking'
import { Card } from '@/components/atoms/Card'
import { RankBadge } from '@/components/atoms/RankBadge'
import { ExpBar } from '@/components/atoms/ExpBar'
import { Stat } from '@/components/atoms/Stat'

interface StudentScreenProps {
  cls: ClassData
}

export function StudentScreen({ cls }: StudentScreenProps) {
  const [i, setI] = useState(0)
  const st = cls.students[i]
  if (!st) return <Card className="p-6 text-center">Lớp chưa có học sinh.</Card>

  const ranking = rankingOf(cls)
  const me = ranking.find((x) => x.student.id === st.id)!
  const s = me.s
  const badges = badgesOf(s, me.place)
  const words = Object.entries(s.evidence)
    .filter(([k]) => /words/i.test(k))
    .flatMap(([, v]) => v)
    .slice(0, 8)

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: C.muted }}>
            Học sinh:
          </span>
          <select
            value={i}
            onChange={(x) => setI(Number(x.target.value))}
            className="rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ border: `1px solid ${C.line}` }}
          >
            {cls.students.map((x, k) => (
              <option key={x.id} value={k}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 text-center" style={{ background: C.board, color: '#fff' }}>
          <div className="text-sm opacity-70">{cls.name}</div>
          <div className="text-3xl font-black">{st.name}</div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: '#ffffff22' }}
            >
              Lv.{s.level}
            </span>
            <RankBadge rank={s.rank} />
          </div>
          <div className="mx-auto mt-4 max-w-sm">
            <ExpBar value={s.expInLevel} color={C.gold} />
            <div className="mt-2 text-xs opacity-80">
              {s.exp} EXP · còn <b>{s.toNext} EXP</b> nữa lên Lv.{s.level + 1}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          <Stat label="Top lớp" value={`#${me.place}`} color={C.gold} />
          <Stat label="Chuỗi chuyên cần" value={`${s.currentStreak} 🔥`} />
          <Stat label="Tổng điểm" value={round1(s.monthTotal)} />
        </div>
      </Card>

      <Card className="p-3">
        <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
          HUY HIỆU ĐÃ ĐẠT
        </div>
        <div className="flex flex-wrap gap-2">
          {badges.length === 0 && (
            <div className="text-sm" style={{ color: C.muted }}>
              Chưa có huy hiệu — cố lên nhé!
            </div>
          )}
          {badges.map((b) => (
            <span
              key={b}
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ background: C.paper, border: `1px solid ${C.line}` }}
            >
              {b}
            </span>
          ))}
        </div>
      </Card>

      {words.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
            TỪ CẦN ÔN LẠI
          </div>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <span
                key={w.text}
                className="rounded-full px-3 py-1 text-sm font-semibold"
                style={{ background: C.gold + '22', color: '#7A5A05' }}
              >
                {w.text}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-3">
        <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
          MỤC TIÊU CỦA CON
        </div>
        {s.errors.length === 0 ? (
          <div className="text-sm" style={{ color: C.muted }}>
            Chưa có lỗi nào được ghi nhận. Giữ phong độ nhé!
          </div>
        ) : (
          s.errors
            .slice(0, 3)
            .map((t) => (
              <div key={t.id} className="py-1 text-sm">
                • Cải thiện <b>{t.label.toLowerCase()}</b> ({t.count} lần)
              </div>
            ))
        )}
      </Card>

      <Card className="p-3">
        <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
          TOP 5 CỦA LỚP
        </div>
        {ranking.slice(0, 5).map((x) => (
          <div
            key={x.student.id}
            className="flex items-center gap-2 py-1.5"
            style={{ fontWeight: x.student.id === st.id ? 700 : 400 }}
          >
            <span className="w-6">{['🥇', '🥈', '🥉'][x.place - 1] ?? x.place}</span>
            <span className="flex-1">{x.student.name}</span>
            <span className="text-xs" style={{ color: C.muted }}>
              Lv.{x.s.level}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{round1(x.s.monthTotal)}</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
