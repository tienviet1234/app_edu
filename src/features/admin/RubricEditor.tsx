import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ExtraComp } from '@/types'
import { C } from '@/constants/colors'
import { getRubric, autoLevel, applyCompOverride, applyCompLabelOverride } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { classService, type ApiClass } from '@/services/classes'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

// Danh sách lớp lấy TRỰC TIẾP từ server (không còn quét localStorage của
// riêng trình duyệt admin) — vì đây là dữ liệu tiêu chí chấm điểm áp dụng
// chung cho MỌI giáo viên/thiết bị đăng nhập vào lớp đó, phải lưu server-side
// mới đồng bộ được (xem server/src/models/Class.ts).
const RUBRIC_QUERY_KEY = ['admin', 'classes', 'rubric-editor'] as const

type CompType = 'score' | 'choice' | 'parts'

const TYPE_LABELS: Record<CompType, string> = {
  score: 'Điểm số',
  choice: 'Lựa chọn',
  parts: 'Các phần',
}

const TYPE_DESC: Record<CompType, string> = {
  score: 'Nhập trực tiếp số điểm (vd: Mini Test)',
  choice: 'Chọn 1 trong nhiều mức (vd: BTVN)',
  parts: 'Gồm nhiều tiêu chí con (vd: Video bài nói)',
}

type RubricPatch = Partial<
  Pick<ApiClass, 'hiddenComps' | 'extraComps' | 'compOverrides' | 'compLabelOverrides'>
>

export function RubricEditor() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: RUBRIC_QUERY_KEY,
    queryFn: () => classService.list({ limit: '100' }),
  })
  const classes = data?.items ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingComp, setEditingComp] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Add form state
  const [showAdd, setShowAdd] = useState(false)
  const [newType, setNewType] = useState<CompType>('score')
  const [newLabel, setNewLabel] = useState('')
  const [newMax, setNewMax] = useState(10)
  const [newOptions, setNewOptions] = useState<Array<{ label: string; pts: number }>>([])
  const [newParts, setNewParts] = useState<Array<{ label: string; max: number }>>([])
  const [optLabel, setOptLabel] = useState('')
  const [optPts, setOptPts] = useState(10)
  const [partLabel, setPartLabel] = useState('')
  const [partMax, setPartMax] = useState(10)

  useEffect(() => {
    if (!selectedId && classes.length) setSelectedId(classes[0]._id)
  }, [selectedId, classes])

  // Gộp các lần sửa liên tiếp (gõ label/điểm) thành 1 lần lưu, tránh gửi 1
  // request mỗi phím gõ — cache react-query cập nhật NGAY (mượt khi gõ), còn
  // request thật lên server chỉ bắn sau 600ms ngừng gõ.
  const pendingRef = useRef<{ classId: string; fields: RubricPatch } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flushPending() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return
    setSaveStatus('saving')
    classService
      .update(pending.classId, pending.fields)
      .then(() => setSaveStatus('saved'))
      .catch(() => {
        setSaveStatus('error')
        qc.invalidateQueries({ queryKey: RUBRIC_QUERY_KEY }) // rollback về đúng dữ liệu server
      })
  }

  function patchClass(classId: string, fields: RubricPatch) {
    qc.setQueryData<typeof data>(RUBRIC_QUERY_KEY, (old) => {
      if (!old) return old
      return { ...old, items: old.items.map((c) => (c._id === classId ? { ...c, ...fields } : c)) }
    })
    pendingRef.current = {
      classId,
      fields: { ...(pendingRef.current?.classId === classId ? pendingRef.current.fields : {}), ...fields },
    }
    setSaveStatus('idle')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flushPending, 600)
  }

  function selectClass(id: string) {
    if (id === selectedId) return
    flushPending()
    setSelectedId(id)
    setEditingComp(null)
    resetForm()
  }

  useEffect(() => () => flushPending(), []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <Card className="p-6 text-center">
        <div className="text-sm" style={{ color: C.muted }}>Đang tải danh sách lớp...</div>
      </Card>
    )
  }

  if (classes.length === 0) {
    return (
      <Card className="p-6 text-center space-y-2">
        <div className="text-2xl">📭</div>
        <div className="font-bold" style={{ color: C.ink }}>Chưa có lớp học nào</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Giáo viên cần tạo lớp và đồng bộ lên Cloud trước. Sau đó quay lại đây để tùy chỉnh tiêu chí.
        </div>
      </Card>
    )
  }

  const current = classes.find((c) => c._id === selectedId) ?? classes[0]
  const level = autoLevel(current.name)
  const baseRubric = getRubric(level)
  const extraComps = current.extraComps ?? []
  const hiddenSet = new Set(current.hiddenComps ?? [])

  // ── helpers ──────────────────────────────────────────────────────────────────

  function toggleHidden(key: string) {
    const hidden = [...(current.hiddenComps ?? [])]
    const idx = hidden.indexOf(key)
    if (idx >= 0) hidden.splice(idx, 1)
    else hidden.push(key)
    patchClass(current._id, { hiddenComps: hidden })
  }

  function setCompOverride(compKey: string, itemId: string, value: number) {
    const overrides = { ...(current.compOverrides ?? {}) }
    overrides[compKey] = { ...(overrides[compKey] ?? {}), [itemId]: value }
    patchClass(current._id, { compOverrides: overrides })
  }

  function resetCompOverride(compKey: string, itemId: string) {
    const overrides = { ...(current.compOverrides ?? {}) }
    if (!overrides[compKey]) return
    const inner = { ...overrides[compKey] }
    delete inner[itemId]
    overrides[compKey] = inner
    patchClass(current._id, { compOverrides: overrides })
  }

  function setBaseLabelOverride(compKey: string, itemId: string, value: string) {
    const labels = { ...(current.compLabelOverrides ?? {}) }
    labels[compKey] = { ...(labels[compKey] ?? {}), [itemId]: value }
    patchClass(current._id, { compLabelOverrides: labels })
  }

  function resetBaseLabelOverride(compKey: string, itemId: string) {
    const labels = { ...(current.compLabelOverrides ?? {}) }
    if (!labels[compKey]) return
    const inner = { ...labels[compKey] }
    delete inner[itemId]
    labels[compKey] = inner
    patchClass(current._id, { compLabelOverrides: labels })
  }

  function removeComp(key: string) {
    patchClass(current._id, { extraComps: extraComps.filter((ec) => ec.key !== key) })
  }

  function updateCompLabel(key: string, label: string) {
    patchClass(current._id, { extraComps: extraComps.map((ec) => (ec.key === key ? { ...ec, label } : ec)) })
  }

  function updateExtraScoreMax(key: string, max: number) {
    if (!max || max < 1) return
    patchClass(current._id, { extraComps: extraComps.map((ec) => (ec.key === key ? { ...ec, max } : ec)) })
  }

  function updateExtraOption(key: string, optId: string, patch: { label?: string; pts?: number }) {
    const next = extraComps.map((ec) => {
      if (ec.key !== key || !ec.options) return ec
      const options = ec.options.map((o) => (o.id === optId ? { ...o, ...patch } : o))
      return { ...ec, options, max: Math.max(...options.map((o) => o.pts)) }
    })
    patchClass(current._id, { extraComps: next })
  }

  function removeExtraOption(key: string, optId: string) {
    const ec = extraComps.find((x) => x.key === key)
    if (!ec?.options || ec.options.length <= 2) return // luôn cần ít nhất 2 mức để chọn
    const options = ec.options.filter((o) => o.id !== optId)
    const next = extraComps.map((x) => (x.key === key ? { ...x, options, max: Math.max(...options.map((o) => o.pts)) } : x))
    patchClass(current._id, { extraComps: next })
  }

  function updateExtraPart(key: string, partId: string, patch: { label?: string; max?: number }) {
    const next = extraComps.map((ec) => {
      if (ec.key !== key || !ec.parts) return ec
      const parts = ec.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p))
      return { ...ec, parts, max: parts.reduce((a, p) => a + p.max, 0) }
    })
    patchClass(current._id, { extraComps: next })
  }

  function removeExtraPart(key: string, partId: string) {
    const ec = extraComps.find((x) => x.key === key)
    if (!ec?.parts || ec.parts.length <= 1) return // luôn cần ít nhất 1 phần
    const parts = ec.parts.filter((p) => p.id !== partId)
    const next = extraComps.map((x) => (x.key === key ? { ...x, parts, max: parts.reduce((a, p) => a + p.max, 0) } : x))
    patchClass(current._id, { extraComps: next })
  }

  function addOption() {
    if (!optLabel.trim()) return
    setNewOptions([...newOptions, { label: optLabel.trim(), pts: optPts }])
    setOptLabel('')
    setOptPts(10)
  }

  function addPart() {
    if (!partLabel.trim()) return
    setNewParts([...newParts, { label: partLabel.trim(), max: partMax }])
    setPartLabel('')
    setPartMax(10)
  }

  function resetForm() {
    setShowAdd(false)
    setNewType('score')
    setNewLabel('')
    setNewMax(10)
    setNewOptions([])
    setNewParts([])
    setOptLabel('')
    setOptPts(10)
    setPartLabel('')
    setPartMax(10)
  }

  function addComp() {
    if (!newLabel.trim()) return
    if (newType === 'choice' && newOptions.length < 2) return
    if (newType === 'parts' && newParts.length < 1) return

    const key = `custom_${uid()}`
    let comp: ExtraComp

    if (newType === 'choice') {
      comp = {
        key,
        label: newLabel.trim(),
        max: Math.max(...newOptions.map((o) => o.pts)),
        type: 'choice',
        options: newOptions.map((o, i) => ({ id: `opt_${i}`, label: o.label, pts: o.pts })),
      }
    } else if (newType === 'parts') {
      comp = {
        key,
        label: newLabel.trim(),
        max: newParts.reduce((a, p) => a + p.max, 0),
        type: 'parts',
        parts: newParts.map((p, i) => ({ id: `part_${i}`, label: p.label, max: p.max })),
      }
    } else {
      comp = { key, label: newLabel.trim(), max: newMax }
    }

    patchClass(current._id, { extraComps: [...extraComps, comp] })
    resetForm()
  }

  const canAdd =
    newLabel.trim().length > 0 &&
    (newType === 'score'
      ? newMax > 0
      : newType === 'choice'
        ? newOptions.length >= 2
        : newParts.length >= 1)

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black" style={{ color: C.ink }}>Tùy chỉnh tiêu chí chấm điểm</div>
          <div className="text-sm mt-1" style={{ color: C.muted }}>
            Ẩn/hiện tiêu chí gốc và thêm tiêu chí tùy chỉnh. Lưu trên server — mọi giáo viên đăng nhập vào lớp này
            (trên bất kỳ thiết bị nào) đều thấy thay đổi ngay khi mở lại trang.
          </div>
        </div>
        <div className="shrink-0 text-xs font-semibold" style={{ color: C.muted }}>
          {saveStatus === 'saving' && <span style={{ color: C.board2 }}>⟳ Đang lưu...</span>}
          {saveStatus === 'saved' && <span style={{ color: C.emerald }}>✓ Đã lưu</span>}
          {saveStatus === 'error' && <span style={{ color: C.red }}>⚠ Lỗi lưu, đã khôi phục dữ liệu cũ</span>}
        </div>
      </div>

      {/* Class selector */}
      <Card className="p-3">
        <div className="text-xs font-bold uppercase mb-2" style={{ color: C.muted }}>
          Chọn lớp ({classes.length} lớp trong hệ thống)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <button
              key={c._id}
              onClick={() => selectClass(c._id)}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold"
              style={{
                background: c._id === current._id ? C.board : C.paper,
                color: c._id === current._id ? '#fff' : C.ink,
                border: `1px solid ${c._id === current._id ? C.board : C.line}`,
              }}
            >
              {c.name}
              <span className="ml-1.5 text-xs opacity-60">
                {autoLevel(c.name) === 'primary' ? 'Cấp 1' : 'Cấp 2-3'}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Standard comps — toggle hide/show */}
      <Card className="p-4">
        <div className="text-xs font-bold uppercase mb-3" style={{ color: C.muted }}>
          Tiêu chí gốc — {current.name} ({baseRubric.label})
        </div>
        <div className="space-y-2">
          {baseRubric.comps.map((comp) => {
            const hidden = hiddenSet.has(comp.key)
            const effComp = applyCompLabelOverride(
              applyCompOverride(comp, current.compOverrides?.[comp.key]),
              current.compLabelOverrides?.[comp.key],
            )
            const isEditing = editingComp === comp.key
            const overrides = current.compOverrides?.[comp.key] ?? {}
            const labels = current.compLabelOverrides?.[comp.key] ?? {}
            return (
              <div
                key={comp.key}
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: hidden ? '#F3F4F6' : C.paper,
                  opacity: hidden ? 0.65 : 1,
                  border: `1px solid ${hidden ? C.line : 'transparent'}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate" style={{ color: C.ink }}>
                      {effComp.label}
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: C.line, color: C.muted }}
                    >
                      {TYPE_LABELS[comp.type as CompType] ?? comp.type}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: C.muted }}>
                      {effComp.max}đ{Object.keys(overrides).length > 0 ? ` (gốc ${comp.max}đ)` : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => setEditingComp(isEditing ? null : comp.key)}
                      className="rounded-lg px-2.5 py-1 text-xs font-bold"
                      style={{
                        color: isEditing ? '#fff' : C.board,
                        border: `1px solid ${C.board}`,
                        background: isEditing ? C.board : C.board + '10',
                      }}
                    >
                      {isEditing ? 'Xong' : 'Sửa'}
                    </button>
                    <button
                      onClick={() => toggleHidden(comp.key)}
                      className="rounded-lg px-2.5 py-1 text-xs font-bold"
                      style={{
                        color: hidden ? C.board : C.muted,
                        border: `1px solid ${hidden ? C.board : C.line}`,
                        background: hidden ? C.board + '10' : 'transparent',
                      }}
                    >
                      {hidden ? '+ Hiện lại' : 'Ẩn'}
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-2.5 space-y-1.5 rounded-lg p-2.5" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
                    <div className="flex items-center justify-between gap-2 pb-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
                      <span className="text-xs font-bold shrink-0" style={{ color: C.muted }}>Tên tiêu chí</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={labels._label ?? comp.label}
                          onChange={(e) => setBaseLabelOverride(comp.key, '_label', e.target.value)}
                          className="w-48 rounded-lg px-2 py-1 text-sm font-semibold"
                          style={{ border: `1px solid ${C.line}` }}
                        />
                        {labels._label != null && (
                          <button onClick={() => resetBaseLabelOverride(comp.key, '_label')} className="text-xs" style={{ color: C.muted }}>↺</button>
                        )}
                      </div>
                    </div>
                    {comp.type === 'score' && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm" style={{ color: C.ink }}>Điểm tối đa</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min="0"
                            value={overrides._max ?? comp.max}
                            onChange={(e) => setCompOverride(comp.key, '_max', Number(e.target.value))}
                            className="w-20 rounded-lg px-2 py-1 text-center text-sm font-bold"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {overrides._max != null && (
                            <button onClick={() => resetCompOverride(comp.key, '_max')} className="text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                      </div>
                    )}
                    {comp.type === 'parts' && (comp.parts ?? []).map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <input
                            value={labels[p.id] ?? p.label}
                            onChange={(e) => setBaseLabelOverride(comp.key, p.id, e.target.value)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {labels[p.id] != null && (
                            <button onClick={() => resetBaseLabelOverride(comp.key, p.id)} className="shrink-0 text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number" min="0"
                            value={overrides[p.id] ?? p.max}
                            onChange={(e) => setCompOverride(comp.key, p.id, Number(e.target.value))}
                            className="w-16 rounded-lg px-2 py-1 text-center text-sm font-bold"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {overrides[p.id] != null && (
                            <button onClick={() => resetCompOverride(comp.key, p.id)} className="text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {comp.type === 'choice' && (comp.options ?? []).map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <input
                            value={labels[o.id] ?? o.label}
                            onChange={(e) => setBaseLabelOverride(comp.key, o.id, e.target.value)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {labels[o.id] != null && (
                            <button onClick={() => resetBaseLabelOverride(comp.key, o.id)} className="shrink-0 text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number" min="0"
                            value={overrides[o.id] ?? o.pts}
                            onChange={(e) => setCompOverride(comp.key, o.id, Number(e.target.value))}
                            className="w-16 rounded-lg px-2 py-1 text-center text-sm font-bold"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {overrides[o.id] != null && (
                            <button onClick={() => resetCompOverride(comp.key, o.id)} className="text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {comp.type === 'ticks' && (comp.items ?? []).map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <input
                            value={labels[it.id] ?? it.label}
                            onChange={(e) => setBaseLabelOverride(comp.key, it.id, e.target.value)}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {labels[it.id] != null && (
                            <button onClick={() => resetBaseLabelOverride(comp.key, it.id)} className="shrink-0 text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number" min="0"
                            value={overrides[it.id] ?? it.pts}
                            onChange={(e) => setCompOverride(comp.key, it.id, Number(e.target.value))}
                            className="w-16 rounded-lg px-2 py-1 text-center text-sm font-bold"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          {overrides[it.id] != null && (
                            <button onClick={() => resetCompOverride(comp.key, it.id)} className="text-xs" style={{ color: C.muted }}>↺</button>
                          )}
                        </div>
                      </div>
                    ))}
                    {comp.type === 'choice' ? (
                      <div className="pt-1 text-xs" style={{ color: '#B45309' }}>
                        ⚠ Đây là tiêu chí "Lựa chọn" — học sinh chỉ chọn ĐÚNG 1 mức, điểm hiển thị
                        ({effComp.max}đ) là mức CAO NHẤT trong các mức, <b>không cộng dồn</b> các mức lại.
                        Nếu muốn chấm nhiều phần độc lập rồi cộng điểm lại (VD hoàn thành + làm đúng +
                        trình bày đẹp), hãy bấm "Ẩn" tiêu chí này rồi thêm 1 "Tiêu chí tùy chỉnh" bên dưới,
                        chọn dạng "Các phần".
                      </div>
                    ) : (
                      <div className="pt-1 text-xs" style={{ color: C.muted }}>
                        Tổng điểm ({effComp.max}đ) tự cộng lại từ các phần trên.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {hiddenSet.size > 0 && (
          <div className="mt-2 text-xs" style={{ color: C.muted }}>
            {hiddenSet.size} tiêu chí đang ẩn khỏi phần nhập điểm.
          </div>
        )}
      </Card>

      {/* Custom comps list */}
      {extraComps.length > 0 && (
        <Card className="p-4">
          <div className="text-xs font-bold uppercase mb-3" style={{ color: C.muted }}>
            Tiêu chí tùy chỉnh ({extraComps.length})
          </div>
          <div className="space-y-2">
            {extraComps.map((ec) => {
              const isEditing = editingComp === ec.key
              return (
                <div
                  key={ec.key}
                  className="rounded-xl p-3"
                  style={{ background: C.paper, border: `1px solid ${C.line}` }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={ec.label}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => updateCompLabel(ec.key, e.target.value)}
                      className="flex-1 min-w-0 text-sm font-semibold rounded-lg px-2 py-1"
                      style={{ border: `1px solid ${C.line}`, color: C.ink }}
                    />
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: C.board + '15', color: C.board }}
                    >
                      {TYPE_LABELS[(ec.type ?? 'score') as CompType]}
                    </span>
                    <span className="text-xs shrink-0" style={{ color: C.muted }}>{ec.max}đ</span>
                    {(ec.type === 'choice' || ec.type === 'parts' || !ec.type) && (
                      <button
                        onClick={() => setEditingComp(isEditing ? null : ec.key)}
                        className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold"
                        style={{
                          color: isEditing ? '#fff' : C.board,
                          border: `1px solid ${C.board}`,
                          background: isEditing ? C.board : C.board + '10',
                        }}
                      >
                        {isEditing ? 'Xong' : 'Sửa'}
                      </button>
                    )}
                    <button
                      onClick={() => removeComp(ec.key)}
                      className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                      style={{ color: C.red }}
                    >
                      Xóa
                    </button>
                  </div>

                  {!isEditing && ec.type === 'choice' && ec.options && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ec.options.map((o) => (
                        <span key={o.id} className="text-xs px-2 py-0.5 rounded-lg" style={{ background: C.board + '12', color: C.board }}>
                          {o.label} · {o.pts}đ
                        </span>
                      ))}
                    </div>
                  )}
                  {!isEditing && ec.type === 'parts' && ec.parts && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ec.parts.map((p) => (
                        <span key={p.id} className="text-xs px-2 py-0.5 rounded-lg" style={{ background: C.gold + '22', color: '#96720E' }}>
                          {p.label} · {p.max}đ
                        </span>
                      ))}
                    </div>
                  )}

                  {isEditing && (!ec.type || ec.type === 'score') && (
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg p-2.5" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
                      <span className="text-sm" style={{ color: C.ink }}>Điểm tối đa</span>
                      <input
                        type="number" min="1"
                        value={ec.max}
                        onChange={(e) => updateExtraScoreMax(ec.key, Number(e.target.value))}
                        className="w-20 rounded-lg px-2 py-1 text-center text-sm font-bold"
                        style={{ border: `1px solid ${C.line}` }}
                      />
                    </div>
                  )}

                  {isEditing && ec.type === 'choice' && ec.options && (
                    <div className="mt-2.5 space-y-1.5 rounded-lg p-2.5" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
                      {ec.options.map((o) => (
                        <div key={o.id} className="flex items-center justify-between gap-2">
                          <input
                            value={o.label}
                            onChange={(e) => updateExtraOption(ec.key, o.id, { label: e.target.value })}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          <div className="flex shrink-0 items-center gap-1.5">
                            <input
                              type="number" min="0"
                              value={o.pts}
                              onChange={(e) => updateExtraOption(ec.key, o.id, { pts: Number(e.target.value) })}
                              className="w-16 rounded-lg px-2 py-1 text-center text-sm font-bold"
                              style={{ border: `1px solid ${C.line}` }}
                            />
                            {ec.options!.length > 2 && (
                              <button onClick={() => removeExtraOption(ec.key, o.id)} className="text-xs font-bold" style={{ color: C.red }}>✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="pt-1 text-xs" style={{ color: '#B45309' }}>
                        ⚠ Học sinh chỉ chọn ĐÚNG 1 mức trong các mức trên (không cộng dồn nhiều mức) — điểm tối
                        đa là mức cao nhất. Cần chấm nhiều phần độc lập rồi cộng lại? Xóa tiêu chí này và tạo
                        lại dạng "Các phần" thay vì "Lựa chọn". Cần giữ lại ít nhất 2 mức lựa chọn.
                      </div>
                    </div>
                  )}

                  {isEditing && ec.type === 'parts' && ec.parts && (
                    <div className="mt-2.5 space-y-1.5 rounded-lg p-2.5" style={{ background: '#fff', border: `1px solid ${C.line}` }}>
                      {ec.parts.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <input
                            value={p.label}
                            onChange={(e) => updateExtraPart(ec.key, p.id, { label: e.target.value })}
                            className="min-w-0 flex-1 rounded-lg px-2 py-1 text-sm"
                            style={{ border: `1px solid ${C.line}` }}
                          />
                          <div className="flex shrink-0 items-center gap-1.5">
                            <input
                              type="number" min="0"
                              value={p.max}
                              onChange={(e) => updateExtraPart(ec.key, p.id, { max: Number(e.target.value) })}
                              className="w-16 rounded-lg px-2 py-1 text-center text-sm font-bold"
                              style={{ border: `1px solid ${C.line}` }}
                            />
                            {ec.parts!.length > 1 && (
                              <button onClick={() => removeExtraPart(ec.key, p.id)} className="text-xs font-bold" style={{ color: C.red }}>✕</button>
                            )}
                          </div>
                        </div>
                      ))}
                      <div className="pt-1 text-xs" style={{ color: C.muted }}>
                        Tổng điểm ({ec.parts.reduce((a, p) => a + p.max, 0)}đ) tự cộng lại từ các phần trên. Cần giữ lại ít nhất 1 phần.
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Add new comp */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl py-3 text-sm font-bold"
          style={{ border: `2px dashed ${C.line}`, color: C.board, background: C.paper }}
        >
          + Thêm tiêu chí tùy chỉnh
        </button>
      ) : (
        <Card className="p-4 space-y-4">
          <div className="text-sm font-black" style={{ color: C.ink }}>Thêm tiêu chí mới</div>

          {/* Type selector */}
          <div>
            <div className="text-xs font-bold mb-2" style={{ color: C.muted }}>Loại tiêu chí</div>
            <div className="grid grid-cols-3 gap-2">
              {(['score', 'choice', 'parts'] as CompType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewType(t)}
                  className="rounded-xl p-2.5 text-left"
                  style={{
                    border: `2px solid ${newType === t ? C.board : C.line}`,
                    background: newType === t ? C.board + '0F' : '#fff',
                  }}
                >
                  <div className="text-xs font-bold" style={{ color: newType === t ? C.board : C.ink }}>
                    {TYPE_LABELS[t]}
                  </div>
                  <div className="text-xs mt-0.5 leading-tight" style={{ color: C.muted }}>
                    {TYPE_DESC[t]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <div className="text-xs font-bold mb-1" style={{ color: C.muted }}>Tên tiêu chí</div>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="vd: Kỹ năng nói, Đọc hiểu..."
              className="w-full rounded-xl px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />
          </div>

          {/* Score: max */}
          {newType === 'score' && (
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: C.muted }}>Điểm tối đa</div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="100"
                  value={newMax}
                  onChange={(e) => setNewMax(Number(e.target.value))}
                  className="w-24 rounded-xl px-3 py-2 text-center text-sm font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span className="text-sm" style={{ color: C.muted }}>điểm</span>
              </div>
            </div>
          )}

          {/* Choice: options builder */}
          {newType === 'choice' && (
            <div>
              <div className="text-xs font-bold mb-2" style={{ color: C.muted }}>
                Các mức lựa chọn <span className="font-normal">(cần ít nhất 2 mức)</span>
              </div>
              {newOptions.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-2" style={{ border: `1px solid ${C.line}` }}>
                  {newOptions.map((o, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                      style={{ borderBottom: i < newOptions.length - 1 ? `1px solid ${C.line}` : undefined }}
                    >
                      <span style={{ color: C.ink }}>{o.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold" style={{ color: C.board }}>{o.pts}đ</span>
                        <button onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))} style={{ color: C.red }} className="text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={optLabel}
                  onChange={(e) => setOptLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addOption()}
                  placeholder="Nhãn mức (vd: Hoàn thành)"
                  className="flex-1 rounded-xl px-3 py-2 text-sm"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <input
                  type="number" min="0" max="200"
                  value={optPts}
                  onChange={(e) => setOptPts(Number(e.target.value))}
                  className="w-16 rounded-xl px-2 py-2 text-center text-sm font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span className="self-center text-xs shrink-0" style={{ color: C.muted }}>đ</span>
                <button
                  onClick={addOption}
                  disabled={!optLabel.trim()}
                  className="rounded-xl px-3 py-2 text-xs font-bold shrink-0"
                  style={{ background: C.board, color: '#fff', opacity: optLabel.trim() ? 1 : 0.4 }}
                >
                  + Thêm
                </button>
              </div>
            </div>
          )}

          {/* Parts: parts builder */}
          {newType === 'parts' && (
            <div>
              <div className="text-xs font-bold mb-2" style={{ color: C.muted }}>
                Các phần nhỏ
                {newParts.length > 0 && <span className="ml-1 font-normal">· Tổng {newParts.reduce((a, p) => a + p.max, 0)}đ</span>}
              </div>
              {newParts.length > 0 && (
                <div className="rounded-xl overflow-hidden mb-2" style={{ border: `1px solid ${C.line}` }}>
                  {newParts.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                      style={{ borderBottom: i < newParts.length - 1 ? `1px solid ${C.line}` : undefined }}
                    >
                      <span style={{ color: C.ink }}>{p.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold" style={{ color: '#96720E' }}>{p.max}đ</span>
                        <button onClick={() => setNewParts(newParts.filter((_, j) => j !== i))} style={{ color: C.red }} className="text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={partLabel}
                  onChange={(e) => setPartLabel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPart()}
                  placeholder="Tên phần (vd: Phát âm rõ ràng)"
                  className="flex-1 rounded-xl px-3 py-2 text-sm"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <input
                  type="number" min="1" max="200"
                  value={partMax}
                  onChange={(e) => setPartMax(Number(e.target.value))}
                  className="w-16 rounded-xl px-2 py-2 text-center text-sm font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span className="self-center text-xs shrink-0" style={{ color: C.muted }}>đ</span>
                <button
                  onClick={addPart}
                  disabled={!partLabel.trim()}
                  className="rounded-xl px-3 py-2 text-xs font-bold shrink-0"
                  style={{ background: C.gold, color: '#fff', opacity: partLabel.trim() ? 1 : 0.4 }}
                >
                  + Thêm
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <Btn kind="solid" onClick={addComp} disabled={!canAdd} className="flex-1">
              Thêm tiêu chí
            </Btn>
            <Btn kind="ghost" onClick={resetForm}>Hủy</Btn>
          </div>
        </Card>
      )}
    </div>
  )
}
