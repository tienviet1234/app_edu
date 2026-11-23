import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { useActionLock } from '@/hooks/useActionLock'
import { CLASS_KEYS } from '@/hooks/useClasses'
import { classService } from '@/services/classes'
import { todayISO, viDate } from '@/utils/format'
import {
  DRAFT_FIELDS, addComp, addItem, draftChanges, draftOf, draftPatch, draftProblems, draftView, earliestEffectiveDate,
  setLabel, setPoints, toggleHidden, type RubricDraft,
} from '@/business/rubricDraft'

const TYPE_TEXT: Record<string, string> = {
  score: 'Điểm số · nhập 1 con số',
  choice: 'Lựa chọn · chọn 1 mức',
  parts: 'Các phần · cộng dồn',
  ticks: 'Tích việc · cộng các việc đã làm',
}

/** Sửa tiêu chí chấm của lớp NGAY TRÊN Bảng chấm điểm (đợt 2b). Cùng phiếu với Admin › Tiêu chí chấm. Lưu chỉ áp
 *  cho buổi từ ngày áp dụng trở đi (sau buổi chấm cuối) — buổi đã chấm giữ nguyên cách tính cũ (server chặn). */
export function RubricSheetEditor({ cls, update }: { cls: ClassData; update: (fn: (c: ClassData) => void) => void }) {
  const qc = useQueryClient()
  const lock = useActionLock()
  const [draft, setDraft] = useState<RubricDraft>(() => draftOf(cls))
  const earliest = useMemo(() => earliestEffectiveDate(cls, todayISO()), [cls])
  const [from, setFrom] = useState(earliest)
  const [newItem, setNewItem] = useState<Record<string, { label: string; pts: string }>>({})
  const view = draftView(cls, draft)
  const changes = draftChanges(cls, draft)
  const problems = draftProblems(cls, draft)
  const patch = draftPatch(cls, draft)
  const dirty = Object.keys(patch).length > 0
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(from) && from >= earliest
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

  const save = () => lock.run('rubric', async () => {
    if (!dirty || problems.length || !dateOk) return
    if (!confirm(`Lưu ${changes.length} thay đổi tiêu chí chấm của ${cls.name}?\n\n${changes.join('\n')}\n\nÁp dụng cho buổi từ ${viDate(from)} trở đi. Mọi buổi trước ngày đó (kể cả buổi đã chấm) giữ nguyên cách tính cũ — tổng điểm, báo cáo, file Excel đã gửi không đổi.`)) return
    try {
      const updated = await classService.update(cls.id, { ...patch, rubricEffectiveFrom: from })
      update((c) => {
        for (const f of DRAFT_FIELDS) (c as unknown as Record<string, unknown>)[f] = (updated as unknown as Record<string, unknown>)[f]
        c.rubricVersions = updated.rubricVersions
      })
      void qc.invalidateQueries({ queryKey: CLASS_KEYS.all })
      setDraft(draftOf({ ...cls, ...updated, level: cls.level } as ClassData))
      const applied = (updated.rubricVersions ?? []).map((v) => v.until).sort().at(-1) ?? from
      toast.success(`✓ Đã lưu tiêu chí chấm của ${cls.name} — áp dụng cho buổi từ ${viDate(applied)}. Buổi trước ngày đó giữ cách tính cũ.`)
    } catch (err) {
      const data = (err as { response?: { data?: { message?: string; data?: { earliest?: string } } } }).response?.data
      if (data?.data?.earliest) setFrom(data.data.earliest)
      toast.error(`Chưa lưu tiêu chí: ${data?.message ?? 'lỗi mạng hoặc server'} Phiếu chấm giữ nguyên, chưa ghi gì.`, { persist: true })
    }
  })

  const inputStyle = { border: `1px solid ${C.line}`, background: C.card, color: C.ink }
  return (
    <div className="space-y-3" data-testid="rubric-editor">
      <div className="text-[13px]" style={{ color: C.muted }}>
        Đổi cách tính điểm của <b style={{ color: C.ink }}>{cls.name}</b> — cùng 1 phiếu với Admin › Tiêu chí chấm. Lưu chỉ áp cho buổi từ ngày áp dụng trở đi; <b>mọi buổi đã chấm giữ nguyên cách tính cũ</b>.
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {view.map((c) => (
          <div key={c.key} className="rounded-xl p-3" data-rubric-comp={c.key} style={{ border: `1px solid ${C.line}`, background: c.hidden ? C.paper : C.card, opacity: c.hidden ? 0.75 : 1 }}>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label={`Tên tiêu chí ${c.label}`} value={c.label} disabled={c.hidden} onChange={(e) => setDraft(setLabel(cls, draft, c.key, null, e.target.value))}
                className="h-10 min-w-0 flex-1 rounded-lg px-2.5 text-sm font-bold" style={inputStyle} />
              <label className="flex min-h-10 items-center gap-1.5 text-[13px]" style={{ color: C.ink }}>
                <input type="checkbox" className="h-5 w-5" checked={c.hidden} onChange={() => setDraft(toggleHidden(draft, c.key))} /> Ẩn
              </label>
            </div>
            <div className="mt-1 text-xs" style={{ color: C.muted }}>{TYPE_TEXT[c.type] ?? c.type} · tối đa {Number.isFinite(c.max) ? c.max : '?'}{c.custom ? ' · tiêu chí riêng của lớp' : ''}</div>
            {!c.hidden && (
              <div className="mt-2 space-y-1.5">
                {c.items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2" data-rubric-item={it.id}>
                    {it.id === '_max'
                      ? <span className="flex-1 text-[13px]" style={{ color: C.ink }}>Điểm tối đa</span>
                      : <input aria-label={`Tên mục ${it.label}`} value={it.label} onChange={(e) => setDraft(setLabel(cls, draft, c.key, it.id, e.target.value))} className="h-9 min-w-0 flex-1 rounded-lg px-2 text-[13px]" style={inputStyle} />}
                    <input aria-label={`Điểm ${it.id === '_max' ? c.label : it.label}`} type="number" min={0} value={Number.isFinite(it.pts) ? it.pts : ''}
                      onChange={(e) => setDraft(setPoints(cls, draft, c.key, it.id, num(e.target.value)))}
                      className="h-9 w-16 rounded-lg px-1 text-center text-sm font-bold" style={inputStyle} />
                    <span className="text-xs" style={{ color: C.muted }}>đ</span>
                  </div>
                ))}
                {c.type !== 'score' && (() => {
                  const ni = newItem[c.key] ?? { label: '', pts: '' }
                  const setNi = (x: { label: string; pts: string }) => setNewItem({ ...newItem, [c.key]: x })
                  const ok = ni.label.trim() && Number.isFinite(num(ni.pts)) && num(ni.pts) >= 0
                  return (
                    <div className="flex items-center gap-2 pt-1">
                      <input aria-label={`Mục mới của ${c.label}`} placeholder="+ Thêm mục" value={ni.label} onChange={(e) => setNi({ ...ni, label: e.target.value })} className="h-9 min-w-0 flex-1 rounded-lg px-2 text-[13px]" style={{ ...inputStyle, borderStyle: 'dashed' }} />
                      <input aria-label={`Điểm mục mới của ${c.label}`} type="number" min={0} placeholder="đ" value={ni.pts} onChange={(e) => setNi({ ...ni, pts: e.target.value })} className="h-9 w-16 rounded-lg px-1 text-center text-sm" style={inputStyle} />
                      <Btn size="sm" kind="ghost" disabled={!ok} onClick={() => { setDraft(addItem(cls, draft, c.key, ni.label.trim(), num(ni.pts))); setNi({ label: '', pts: '' }) }}>Thêm</Btn>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" kind="ghost" onClick={() => setDraft(addComp(draft, 'score', 'Tiêu chí mới', 10))}>+ Thêm tiêu chí: Điểm số</Btn>
        <Btn size="sm" kind="ghost" onClick={() => setDraft(addComp(draft, 'choice', 'Tiêu chí mới', 10))}>+ Thêm tiêu chí: Lựa chọn</Btn>
        <Btn size="sm" kind="ghost" onClick={() => setDraft(addComp(draft, 'parts', 'Tiêu chí mới', 10))}>+ Thêm tiêu chí: Các phần</Btn>
      </div>
      <div className="rounded-xl px-3 py-2 text-xs" style={{ background: '#FFFBEB', border: `1px solid ${C.gold}`, color: C.ink }}>
        Không đổi KIỂU tiêu chí đã có (VD "Các phần" → "Tích việc") — 06/10 đổi Thái độ kiểu này làm 185 buổi bị tính 0 điểm. Muốn đổi kiểu: ẩn tiêu chí cũ, thêm tiêu chí mới.
      </div>

      {dirty && (
        <div className="space-y-2 rounded-xl p-3" style={{ border: `2px solid ${C.board}`, background: C.card }} data-testid="rubric-preview">
          <div className="font-bold" style={{ color: C.ink }}>Trước khi lưu — xem ảnh hưởng</div>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px]" style={{ color: C.ink }}>
            {changes.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <label className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: C.ink }}>
            <b>Áp dụng cho buổi từ ngày</b>
            <input type="date" aria-label="Áp dụng từ ngày" min={earliest} value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg px-2" style={inputStyle} />
            <span style={{ color: C.muted }}>sớm nhất {viDate(earliest)}</span>
          </label>
          <div className="text-[13px]" style={{ color: C.muted }}>
            Mọi buổi TRƯỚC ngày này — kể cả buổi đã chấm — giữ nguyên cách tính cũ: tổng điểm, báo cáo, xếp hạng, file Excel đã gửi phụ huynh không đổi. Không áp dụng lùi được vào ngày đã chấm.
          </div>
          {!dateOk && <div className="text-[13px] font-bold" style={{ color: C.red }}>Ngày áp dụng phải từ {viDate(earliest)} trở đi.</div>}
          {problems.map((p) => <div key={p} className="text-[13px] font-bold" style={{ color: C.red }}>{p}</div>)}
          <div className="flex flex-wrap items-center gap-2">
            <Btn kind="solid" disabled={!!problems.length || !dateOk || lock.isBusy('rubric')} onClick={save}>{lock.isBusy('rubric') ? 'Đang lưu…' : 'Lưu tiêu chí'}</Btn>
            <Btn kind="ghost" disabled={lock.isBusy('rubric')} onClick={() => { setDraft(draftOf(cls)); setFrom(earliest) }}>Hủy thay đổi</Btn>
          </div>
          <div className="text-xs" style={{ color: C.muted }}>Mọi lần đổi tiêu chí được ghi vào nhật ký và Lịch sử thay đổi. Ai được sửa: admin + giáo viên của lớp.</div>
        </div>
      )}
    </div>
  )
}
