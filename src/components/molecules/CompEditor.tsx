import { useState } from 'react'
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
  maxDraft?: string
  onMaxInput?: (raw: string) => void
  onMaxCommit?: (raw: string) => void
}

// 4 mức hay dùng hiện sẵn; các mức lẻ còn lại nằm sau nút "Khác" để hàng nút
// đủ to (44px) mà không bị chen chúc trên màn hình điện thoại.
const MAIN_PRESETS = [0, 50, 80, 100]
const MORE_PRESETS = [60, 70, 75, 90]

export function CompEditor({ comp, e, mut, ratioTotals, maxDraft, onMaxInput, onMaxCommit }: CompEditorProps) {
  const [showMorePresets, setShowMorePresets] = useState(false)
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
    // Điểm hiện tại đang khớp 1 mức lẻ (VD 70%) thì tự mở "Khác" để thấy mức đang chọn.
    const currentIsMorePreset = MORE_PRESETS.some((p) => numScore === Math.round((p / 100) * comp.max))
    const visiblePresets = showMorePresets || currentIsMorePreset
      ? [...MAIN_PRESETS, ...MORE_PRESETS].sort((a, b) => a - b)
      : MAIN_PRESETS
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
        <div className="mb-2 flex flex-wrap gap-2">
          {visiblePresets.map((p) => {
            const sv = Math.round((p / 100) * comp.max)
            const active = numScore === sv
            return (
              <button
                key={p}
                type="button"
                onClick={() => mut((en) => { en.scores[comp.key] = sv })}
                className="min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold"
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
          {!(showMorePresets || currentIsMorePreset) && (
            <button
              type="button"
              onClick={() => setShowMorePresets(true)}
              className="min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold"
              style={{ background: '#fff', color: C.board2, border: `1px dashed ${C.board2}88` }}
            >
              Khác
            </button>
          )}
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
            className="h-11 w-20 rounded-lg px-2 text-center text-lg font-bold"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span className="text-sm" style={{ color: C.muted }}>/</span>
          <input
            type="text"
            inputMode="numeric"
            value={maxDraft ?? String(comp.max)}
            onFocus={(x) => x.target.select()}
            onChange={(x) => onMaxInput?.(x.target.value.replace(/\D/g, ''))}
            onBlur={(x) => onMaxCommit?.(x.target.value)}
            onKeyDown={(x) => { if (x.key === 'Enter') x.currentTarget.blur() }}
            title="Đổi số câu tối đa của tiêu chí này"
            className="h-11 w-14 rounded-lg px-1 text-center text-sm font-bold"
            style={{ border: `1px solid ${C.board}66` }}
          />
          <span className="text-sm" style={{ color: C.muted }}>· nhập tay</span>
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
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} onTotalCommit={onMaxCommit} />
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
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} onTotalCommit={onMaxCommit} />
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
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} onTotalCommit={onMaxCommit} />
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
                    className="h-11 w-14 rounded-lg px-1 text-center font-bold"
                    style={{ border: `1px solid ${C.line}` }}
                  />
                </div>
              )
            })}
          </div>
        )}
        <EvidenceFields comp={comp} e={e} mut={mut} ratioTotals={ratioTotals} onTotalCommit={onMaxCommit} />
      </div>
    )
  }
  return null
}
