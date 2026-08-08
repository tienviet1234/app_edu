import { useMemo, useState } from 'react'
import { produce } from 'immer'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { getRubric } from '@/constants/rubrics'
import { round1 } from '@/utils/format'
import { statsOf } from '@/business/stats'
import { rankingOf, badgesOf } from '@/business/ranking'
import { missionsOf, AVATARS, defaultAvatar } from '@/business/missions'
import { sessionScore } from '@/business/scoring'
import { Card } from '@/components/atoms/Card'
import { RankBadge } from '@/components/atoms/RankBadge'
import { ExpBar } from '@/components/atoms/ExpBar'

interface LeaderboardScreenProps {
  cls: ClassData
  update: (fn: (c: ClassData) => void) => void
  userId?: string
}

// ── Avatar picker popover ─────────────────────────────────────────────────────
function AvatarPicker({ current, onPick, onClose }: {
  current: string
  onPick: (a: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#00000050' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-4 shadow-xl"
        style={{ background: C.card, border: `1px solid ${C.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-bold" style={{ color: C.muted }}>Chọn avatar</div>
        <div className="grid grid-cols-6 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              onClick={() => { onPick(a); onClose() }}
              className="rounded-xl text-2xl transition"
              style={{
                padding: '6px',
                background: a === current ? C.board2 + '30' : 'transparent',
                border: a === current ? `2px solid ${C.board2}` : '2px solid transparent',
              }}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Coins history mini-list ───────────────────────────────────────────────────
function CoinsHistory({ cls, studentId }: { cls: ClassData; studentId: string }) {
  const r = getRubric(cls.level)
  const rows = cls.sessions
    .map((s, i) => {
      const e = s.entries[studentId]
      const score = e ? (sessionScore(e, r) ?? null) : null
      const coins = score !== null ? 5 + score + (score >= 90 ? 10 : 0) : null
      return { no: s.no ?? i + 1, score, coins }
    })
    .filter((x) => x.coins !== null)
    .slice(-8)
    .reverse()

  if (!rows.length)
    return <div className="text-xs py-2" style={{ color: C.muted }}>Chưa có dữ liệu.</div>

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.no} className="flex items-center justify-between text-xs">
          <span style={{ color: C.muted }}>Buổi {row.no}</span>
          <div className="flex items-center gap-2">
            <span style={{ color: C.ink }}>{row.score} điểm</span>
            <span
              className="rounded-full px-2 py-0.5 font-bold"
              style={{ background: C.gold + '25', color: '#7A5A05' }}
            >
              +{row.coins} 🪙
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function LeaderboardScreen({ cls, update, userId }: LeaderboardScreenProps) {
  const r = getRubric(cls.level)
  const [expanded, setExpanded] = useState<string | null>(() => userId ?? null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<'board' | 'class'>('board')

  const now = rankingOf(cls)
  const prev = cls.sessions.length > 1 ? rankingOf(cls, cls.sessions.length - 1) : null
  const pp: Record<string, number> = {}
  if (prev) prev.forEach((x) => (pp[x.student.id] = x.place))

  const tops = useMemo(() => {
    const pick = (fn: (s: (typeof now)[0]['s']) => number, label: string, fmt: (v: number) => string) => {
      const b = [...now].sort((a, z) => fn(z.s) - fn(a.s))[0]
      return b && fn(b.s) > 0 ? { label, name: b.student.name, text: fmt(fn(b.s)) } : null
    }
    return [
      ...r.comps.map((c) => pick((s) => s.catAvg[c.key], `Top ${c.label}`, (v) => `${round1(v)}/${c.max}`)),
      pick((s) => s.attendScore, 'Top Chuyên cần', (v) => `${round1(v)}/10`),
      pick((s) => s.progress, 'Top Tiến bộ', (v) => `+${round1(v)} điểm`),
    ].filter(Boolean)
  }, [now, r.comps])

  const classErrors = useMemo(() => {
    const m: Record<string, number> = {}
    now.forEach((x) => x.s.errors.forEach((t) => (m[t.label] = (m[t.label] ?? 0) + t.count)))
    return Object.entries(m)
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
  }, [now])

  const classWords = useMemo(() => {
    const m = new Map<string, { text: string; n: number }>()
    now.forEach((x) =>
      Object.entries(x.s.evidence).forEach(([k, items]) => {
        if (!/words/i.test(k)) return
        items.forEach((it) =>
          m.set(it.text.toLowerCase(), {
            text: it.text,
            n: (m.get(it.text.toLowerCase())?.n ?? 0) + it.n,
          }),
        )
      }),
    )
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12)
  }, [now])

  function setAvatar(studentId: string, avatar: string) {
    update(produce((c) => {
      const st = c.students.find((s: { id: string }) => s.id === studentId)
      if (st) st.avatar = avatar
    }))
  }

  return (
    <div className="space-y-3">
      {/* Sub-tab toggle */}
      <div className="flex gap-2">
        {(['board', 'class'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className="rounded-xl px-4 py-2 text-sm font-bold transition"
            style={{
              background: subTab === t ? C.board : C.line,
              color: subTab === t ? '#fff' : C.muted,
            }}
          >
            {t === 'board' ? '🏆 Xếp hạng' : '📊 Lớp học'}
          </button>
        ))}
      </div>

      {subTab === 'board' && (
        <>
          {/* Ranking list */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3" style={{ background: C.board, color: '#fff' }}>
              <div className="text-sm opacity-80">{r.label} · sau buổi {cls.sessions.length}</div>
              <div className="text-lg font-bold">{cls.name}</div>
            </div>

            {now.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Chưa có học sinh.</div>
            ) : now.map((x) => {
              const d = prev ? (pp[x.student.id] ?? x.place) - x.place : 0
              const isOpen = expanded === x.student.id
              const isOwn = !!userId && x.student.id === userId
              const avatar = x.student.avatar ?? defaultAvatar(x.student.id)
              const badges = badgesOf(x.s, x.place)
              const missions = missionsOf(x.s)
              const doneMissions = missions.filter((m) => m.done).length

              return (
                <div
                  key={x.student.id}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    ...(isOwn ? { background: C.gold + '0A', borderLeft: `3px solid ${C.gold}` } : {}),
                  }}
                >
                  {/* Main row */}
                  <div
                    className="flex items-center gap-3 px-3 py-3 cursor-pointer select-none"
                    onClick={() => setExpanded(isOpen ? null : x.student.id)}
                    style={{ background: isOpen ? C.board + '08' : 'transparent' }}
                  >
                    {/* Place */}
                    <div className="w-7 text-center text-lg font-bold shrink-0">
                      {['🥇', '🥈', '🥉'][x.place - 1] ?? <span className="text-sm" style={{ color: C.muted }}>{x.place}</span>}
                    </div>

                    {/* Avatar */}
                    <button
                      className="text-2xl leading-none shrink-0 rounded-xl"
                      style={{ padding: '2px' }}
                      onClick={(e) => { e.stopPropagation(); setPickerFor(x.student.id) }}
                      title="Đổi avatar"
                    >
                      {avatar}
                    </button>

                    {/* Name + level + exp bar */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{x.student.name}</span>
                        <span className="text-xs font-semibold" style={{ color: C.muted }}>Lv.{x.s.level}</span>
                        <RankBadge rank={x.s.rank} small />
                        {badges.length > 0 && (
                          <span
                            className="text-xs rounded-full px-2 py-0.5 font-bold"
                            style={{ background: C.gold + '28', color: '#7A5A05' }}
                          >
                            {badges.length} huy hiệu
                          </span>
                        )}
                        {doneMissions > 0 && (
                          <span
                            className="text-xs rounded-full px-2 py-0.5 font-bold"
                            style={{ background: C.board2 + '20', color: C.board2 }}
                          >
                            {doneMissions}/{missions.length} nhiệm vụ
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1">
                          <ExpBar value={x.s.expInLevel} color={x.s.rank.color} />
                        </div>
                        <span className="text-xs shrink-0" style={{ color: C.muted }}>
                          {x.s.exp} 🪙
                        </span>
                      </div>
                    </div>

                    {/* Score + delta */}
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {round1(x.s.monthTotal)}
                      </div>
                      <div className="text-xs" style={{ color: d > 0 ? C.board2 : d < 0 ? C.red : C.muted }}>
                        {d > 0 ? `↑ +${d}` : d < 0 ? `↓ ${d}` : '='}
                      </div>
                    </div>
                  </div>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div
                      className="px-4 pb-4 space-y-4"
                      style={{ borderTop: `1px solid ${C.line}`, background: C.paper }}
                    >
                      <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-3">

                        {/* Missions */}
                        <div>
                          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                            Nhiệm vụ kỳ này
                          </div>
                          <div className="space-y-1.5">
                            {missions.map((m) => (
                              <div key={m.id} className="flex items-start gap-2">
                                <span className="text-base leading-none mt-0.5 shrink-0">{m.icon}</span>
                                <div className="min-w-0">
                                  <div
                                    className="text-xs font-semibold leading-tight"
                                    style={{
                                      color: m.done ? C.board2 : C.ink,
                                      textDecoration: m.done ? 'none' : 'none',
                                    }}
                                  >
                                    {m.done ? '✓ ' : ''}{m.label}
                                  </div>
                                  <div className="text-xs" style={{ color: C.muted }}>{m.progress}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Badges */}
                        <div>
                          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                            Huy hiệu đạt được
                          </div>
                          {badges.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {badges.map((b) => (
                                <span
                                  key={b}
                                  className="rounded-xl px-2 py-1 text-xs font-semibold"
                                  style={{ background: C.gold + '28', color: '#7A5A05', border: `1px solid ${C.gold}50` }}
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs" style={{ color: C.muted }}>Chưa có huy hiệu.</div>
                          )}

                          {/* Stats mini */}
                          <div className="mt-3 grid grid-cols-2 gap-1.5">
                            {[
                              { label: 'Có mặt', val: `${x.s.present + x.s.late}/${x.s.counted || cls.sessions.length}` },
                              { label: 'Điểm TB', val: round1(x.s.avg) },
                              { label: 'Chuỗi tốt', val: `${x.s.streak} buổi` },
                              { label: 'Tổng XP', val: `${x.s.exp} 🪙` },
                            ].map(({ label, val }) => (
                              <div key={label} className="rounded-lg p-2 text-center" style={{ background: C.card }}>
                                <div className="text-sm font-bold" style={{ color: C.ink }}>{val}</div>
                                <div className="text-xs" style={{ color: C.muted }}>{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Coins history */}
                        <div>
                          <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
                            Lịch sử xu (8 buổi gần)
                          </div>
                          <CoinsHistory cls={cls} studentId={x.student.id} />
                          <div
                            className="mt-2 rounded-xl p-2 text-center text-sm font-bold"
                            style={{ background: C.gold + '20', color: '#7A5A05' }}
                          >
                            Tổng tích lũy: {x.s.exp} 🪙
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </Card>

          {/* Top achievements */}
          {tops.length > 0 && (
            <div>
              <div className="mb-2 px-1 text-sm font-bold" style={{ color: C.muted }}>
                THÀNH TÍCH NỔI BẬT
              </div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {tops.map((t) =>
                  t ? (
                    <Card key={t.label} className="p-3">
                      <div className="text-xs font-semibold" style={{ color: C.gold }}>{t.label}</div>
                      <div className="text-lg font-bold">{t.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{t.text}</div>
                    </Card>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </>
      )}

      {subTab === 'class' && (
        <>
          {/* Mission summary across class */}
          <Card className="p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: C.muted }}>
              TỔNG QUAN NHIỆM VỤ CẢ LỚP
            </div>
            {now.length === 0 ? (
              <div className="text-sm" style={{ color: C.muted }}>Chưa có học sinh.</div>
            ) : (
              <div className="space-y-2">
                {missionsOf(statsOf(cls, now[0]?.student.id ?? '', 0, null)).map((template) => {
                  const done = now.filter((x) => missionsOf(x.s).find((m) => m.id === template.id)?.done).length
                  const pct = now.length > 0 ? Math.round((done / now.length) * 100) : 0
                  return (
                    <div key={template.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-semibold" style={{ color: C.ink }}>
                          {template.icon} {template.label}
                        </div>
                        <div className="text-xs font-bold" style={{ color: pct >= 80 ? C.board2 : pct >= 50 ? C.gold : C.muted }}>
                          {done}/{now.length}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 80 ? C.board2 : pct >= 50 ? C.gold : C.red,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Word errors */}
          {classWords.length > 0 && (
            <Card className="p-3">
              <div className="mb-2 text-xs font-bold" style={{ color: C.muted }}>
                TỪ CẢ LỚP HAY SAI — ôn đầu buổi
              </div>
              <div className="flex flex-wrap gap-1.5">
                {classWords.map((w) => (
                  <span
                    key={w.text}
                    className="rounded-full px-3 py-1 text-sm font-semibold"
                    style={{ background: C.red + '12', color: C.red, border: `1px solid ${C.red}44` }}
                  >
                    {w.text} <span className="opacity-60">×{w.n}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Class weakness chart */}
          <Card className="p-3">
            <div className="mb-1 text-xs font-bold" style={{ color: C.muted }}>
              TIÊU CHÍ CẢ LỚP CÒN YẾU
            </div>
            {classErrors.length === 0 ? (
              <div className="py-3 text-sm" style={{ color: C.muted }}>Chưa có dữ liệu.</div>
            ) : (
              <div style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classErrors} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 0 }}>
                    <CartesianGrid stroke={C.line} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: C.ink }} />
                    <Tooltip />
                    <Bar dataKey="n" name="Số lần" radius={[0, 6, 6, 0]} fill={C.red} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Avatar picker modal */}
      {pickerFor && (
        <AvatarPicker
          current={cls.students.find((s) => s.id === pickerFor)?.avatar ?? defaultAvatar(pickerFor)}
          onPick={(a) => setAvatar(pickerFor, a)}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  )
}
