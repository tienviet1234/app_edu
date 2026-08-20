import type { RubricComponent, SessionEntry } from '@/types'
import { C } from '@/constants/colors'
import { STARS_LABELS } from '@/constants/ranks'
import { compScore } from '@/business/scoring'
import { Chip } from '@/components/atoms/Chip'
import { Pick } from '@/components/atoms/Pick'
import { Stars } from '@/components/atoms/Stars'
import { EvidenceFields } from './EvidenceFields'

interface CompEditorProps {
  comp: RubricComponent
  e: SessionEntry
  mut: (fn: (en: SessionEntry) => void) => void
  ratioTotals?: Record<string, number>
}

export function CompEditor({ comp, e, mut, ratioTotals }: CompEditorProps) {
  const val = compScore(comp, e)
  const head = (
    <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>
      {comp.label} —{' '}
      <span style={{ color: val >= comp.max ? C.board2 : C.ink }}>
        {val}/{comp.max}
      </span>
    </div>
  )

  if (comp.type === 'score') {
    const rawScore = e.scores?.[comp.key]
    const numScore = rawScore === '' || rawScore == null ? null : Number(rawScore)
    const pct = numScore !== null && comp.max > 0 ? Math.round((numScore / comp.max) * 100) : null
    const PRESETS = [0, 50, 60, 70, 75, 80, 90, 100]
    return (
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase" style={{ color: C.muted }}>
            {comp.label}
          </span>
          {numScore !== null && (
            <>
              <span className="text-xs font-semibold" style={{ color: numScore >= comp.max ? C.board2 : C.ink }}>
                {numScore}/{comp.max}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-bold"
                style={{
                  background: pct! >= 80 ? C.board2 + '22' : pct! >= 60 ? C.gold + '33' : C.red + '22',
                  color: pct! >= 80 ? C.board2 : pct! >= 60 ? '#7A5A05' : C.red,
                }}
              >
                {pct}%
              </span>
            </>
          )}
        </div>
        <div className="mb-2 flex flex-wrap gap-1">
          {PRESETS.map((p) => {
            const sv = Math.round((p / 100) * comp.max)
            const active = numScore === sv
            return (
              <button
                key={p}
                onClick={() => mut((en) => { en.scores[comp.key] = sv })}
                className="rounded-lg px-2 py-1 text-xs font-semibold"
                style={{
                  background: active ? C.board : C.paper,
                  color: active ? '#fff' : C.muted,
                  border: `1px solid ${active ? C.board : C.line}`,
                }}
              >
                {p}%<span className="opacity-60"> ({sv})</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max={comp.max}
            value={e.scores?.[comp.key] ?? ''}
            onFocus={(x) => x.target.select()}
            onChange={(x) =>
              mut((en) => {
                en.scores[comp.key] = x.target.value
              })
            }
            className="w-20 rounded-lg px-2 py-1 text-center text-lg font-bold"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span className="text-sm" style={{ color: C.muted }}>/ {comp.max} · nhập tay</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(comp.tags ?? []).map((t) => (
            <Chip
              key={t.id}
              tone={t.good ? 'good' : 'err'}
              on={(e.tags?.[comp.key] ?? []).includes(t.id)}
              onClick={() =>
                mut((en) => {
                  const a = (en.tags[comp.key] ?? []) as string[]
                  en.tags[comp.key] = a.includes(t.id) ? a.filter((y: string) => y !== t.id) : [...a, t.id]
                })
              }
            >
              {t.label}
            </Chip>
          ))}
        </div>
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} />
      </div>
    )
  }

  if (comp.type === 'ticks') {
    const sel = e.ticks?.[comp.key] ?? []
    return (
      <div>
        <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted }}>
          {comp.label} — <span style={{ color: C.ink }}>{val}/{comp.max}</span>
          {comp.stars && (
            <>
              {' '}
              <Stars n={sel.length} />{' '}
              <span style={{ color: C.ink }}>{STARS_LABELS[sel.length]}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(comp.items ?? []).map((t) => (
            <Chip
              key={t.id}
              tone="good"
              on={sel.includes(t.id)}
              onClick={() =>
                mut((en) => {
                  const a = (en.ticks[comp.key] ?? []) as string[]
                  en.ticks[comp.key] = a.includes(t.id)
                    ? a.filter((y: string) => y !== t.id)
                    : [...a, t.id]
                })
              }
            >
              {t.label} <span className="opacity-60">{t.pts}đ</span>
            </Chip>
          ))}
        </div>
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} />
      </div>
    )
  }

  if (comp.type === 'choice') {
    return (
      <div>
        {head}
        <div className="flex flex-wrap gap-2">
          {(comp.options ?? []).map((o) => (
            <Pick
              key={o.id}
              tone={o.err ? 'bad' : 'good'}
              on={e.choice?.[comp.key] === o.id}
              onClick={() =>
                mut((en) => {
                  en.choice[comp.key] = o.id
                })
              }
            >
              {o.label} <span className="opacity-60">{o.pts}đ</span>
            </Pick>
          ))}
        </div>
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} />
      </div>
    )
  }

  if (comp.type === 'parts') {
    const skipped = !!e.skip?.[comp.key]
    const m = e.parts?.[comp.key] ?? {}
    const setPart = (id: string, v: string | number) =>
      mut((en) => {
        en.parts[comp.key] = { ...(en.parts[comp.key] ?? {}), [id]: v }
      })
    return (
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase" style={{ color: C.muted }}>
            {comp.label} —{' '}
            <span style={{ color: val >= comp.max ? C.board2 : C.ink }}>
              {val}/{comp.max}
            </span>
          </span>
          {comp.zeroLabel && (
            <Chip
              on={skipped}
              onClick={() =>
                mut((en) => {
                  en.skip[comp.key] = !skipped
                })
              }
            >
              {comp.zeroLabel}
            </Chip>
          )}
        </div>
        {!skipped && (
          <div className="space-y-1.5">
            {(comp.parts ?? []).map((p) => {
              const rawVal = m[p.id]
              const v = rawVal === '' || rawVal == null ? null : Number(rawVal)
              const half = Math.round(p.max * 0.6)
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="flex-1 text-sm" style={{ minWidth: 150 }}>
                    {p.label} <span style={{ color: C.muted }}>({p.max})</span>
                  </span>
                  <Pick size="sm" tone="good" on={v === p.max} onClick={() => setPart(p.id, p.max)}>
                    Đạt
                  </Pick>
                  <Pick
                    size="sm"
                    tone="neutral"
                    on={v !== null && v > 0 && v < p.max}
                    onClick={() => setPart(p.id, half)}
                  >
                    Một phần
                  </Pick>
                  <Pick size="sm" tone="bad" on={v === 0} onClick={() => setPart(p.id, 0)}>
                    Chưa đạt
                  </Pick>
                  <input
                    type="number"
                    min="0"
                    max={p.max}
                    value={m[p.id] ?? ''}
                    onFocus={(x) => x.target.select()}
                    onChange={(x) => setPart(p.id, x.target.value)}
                    className="w-14 rounded-lg px-1 py-1 text-center font-bold"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                </div>
              )
            })}
          </div>
        )}
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} />
      </div>
    )
  }
  return null
}
