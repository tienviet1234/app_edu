import type { RubricComponent, SessionEntry } from '@/types'
import { C } from '@/constants/colors'
import { produce } from 'immer'

interface EvidenceFieldsProps {
  comp: RubricComponent
  e: SessionEntry
  mut: (fn: (en: SessionEntry) => void) => void
}

export function EvidenceFields({ comp, e, mut }: EvidenceFieldsProps) {
  if (!comp.evidence) return null
  const get = (k: string) => e.ev?.[comp.key]?.[k]
  const set = (k: string, v: unknown) =>
    mut(
      produce((en) => {
        en.ev[comp.key] = { ...(en.ev[comp.key] ?? {}), [k]: v }
      }),
    )

  return (
    <div className="mt-2 space-y-1.5 rounded-xl p-2" style={{ background: C.paper }}>
      {comp.evidence.map((ev) => {
        if (ev.type === 'ratio') {
          const v = get(ev.key) as { ok?: string | number; total?: string | number } | undefined
          return (
            <div key={ev.key} className="flex items-center gap-2">
              <span className="text-xs" style={{ color: C.muted, minWidth: 78 }}>
                {ev.label}
              </span>
              <input
                type="number"
                min="0"
                value={v?.ok ?? ''}
                onFocus={(x) => x.target.select()}
                onChange={(x) => set(ev.key, { total: 20, ...v, ok: x.target.value })}
                className="w-16 rounded-lg px-2 py-1 text-center font-bold"
                style={{ border: `1px solid ${C.line}`, background: '#fff' }}
              />
              <span style={{ color: C.muted }}>/</span>
              <input
                type="number"
                min="1"
                value={v?.total ?? 20}
                onFocus={(x) => x.target.select()}
                onChange={(x) => set(ev.key, { ok: '', ...v, total: x.target.value })}
                className="w-16 rounded-lg px-2 py-1 text-center font-bold"
                style={{ border: `1px solid ${C.line}`, background: '#fff' }}
              />
              <span className="text-xs" style={{ color: C.muted }}>
                {ev.unit ?? 'câu đúng'}
              </span>
            </div>
          )
        }
        return (
          <div key={ev.key} className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.muted, minWidth: 78 }}>
              {ev.label}
            </span>
            <input
              value={(get(ev.key) as string) ?? ''}
              onChange={(x) => set(ev.key, x.target.value)}
              placeholder={ev.ph ?? 'ngăn cách bằng dấu phẩy'}
              className="flex-1 rounded-lg px-2 py-1 text-sm"
              style={{ border: `1px solid ${C.line}`, background: '#fff' }}
            />
          </div>
        )
      })}
    </div>
  )
}
