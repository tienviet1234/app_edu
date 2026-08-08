import { useState, useEffect, type ChangeEvent } from 'react'
import type { ClassData, ExtraComp } from '@/types'
import { C } from '@/constants/colors'
import { getRubric } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

// ── Read/write ALL teachers' localStorage stores ──────────────────────────────

interface StoredClass {
  storageKey: string
  classIdx: number
  cls: ClassData
  teacherLabel: string
}

function loadAllClasses(): StoredClass[] {
  const result: StoredClass[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith('lms:data:v5')) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const data = JSON.parse(raw) as { classes?: ClassData[] }
      const userId = key === 'lms:data:v5' ? '(mặc định)' : key.replace('lms:data:v5:', '').slice(0, 8)
      ;(data.classes ?? []).forEach((cls, idx) => {
        result.push({ storageKey: key, classIdx: idx, cls, teacherLabel: `GV ${userId}` })
      })
    }
  } catch {}
  return result
}

function patchClass(storageKey: string, classIdx: number, patch: Partial<ClassData>) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const data = JSON.parse(raw) as { classes: ClassData[] }
    data.classes[classIdx] = { ...data.classes[classIdx], ...patch }
    localStorage.setItem(storageKey, JSON.stringify(data))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────

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

export function RubricEditor() {
  const [allClasses, setAllClasses] = useState<StoredClass[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

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
    const list = loadAllClasses()
    setAllClasses(list)
    setSelectedIdx(0)
  }, [])

  if (allClasses.length === 0) {
    return (
      <Card className="p-6 text-center space-y-2">
        <div className="text-2xl">📭</div>
        <div className="font-bold" style={{ color: C.ink }}>Chưa có lớp học nào</div>
        <div className="text-sm" style={{ color: C.muted }}>
          Giáo viên cần tạo lớp trong App trước. Sau đó quay lại đây để tùy chỉnh tiêu chí.
        </div>
      </Card>
    )
  }

  const current = allClasses[selectedIdx]
  const cls = current.cls
  const baseRubric = getRubric(cls.level)
  const extraComps = cls.extraComps ?? []
  const hiddenSet = new Set(cls.hiddenComps ?? [])

  // ── helpers ──────────────────────────────────────────────────────────────────

  function refresh() {
    const list = loadAllClasses()
    setAllClasses(list)
  }

  function toggleHidden(key: string) {
    const hidden = [...(cls.hiddenComps ?? [])]
    const idx = hidden.indexOf(key)
    if (idx >= 0) hidden.splice(idx, 1)
    else hidden.push(key)
    patchClass(current.storageKey, current.classIdx, { hiddenComps: hidden })
    refresh()
  }

  function removeComp(key: string) {
    const next = extraComps.filter((ec) => ec.key !== key)
    patchClass(current.storageKey, current.classIdx, { extraComps: next })
    refresh()
  }

  function updateCompLabel(key: string, label: string) {
    const next = extraComps.map((ec) => ec.key === key ? { ...ec, label } : ec)
    patchClass(current.storageKey, current.classIdx, { extraComps: next })
    refresh()
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

    patchClass(current.storageKey, current.classIdx, {
      extraComps: [...extraComps, comp],
    })
    refresh()
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
      <div>
        <div className="text-lg font-black" style={{ color: C.ink }}>Tùy chỉnh tiêu chí chấm điểm</div>
        <div className="text-sm mt-1" style={{ color: C.muted }}>
          Ẩn/hiện tiêu chí gốc và thêm tiêu chí tùy chỉnh. Thay đổi có hiệu lực ngay khi giáo viên mở lại trang.
        </div>
      </div>

      {/* Class selector */}
      <Card className="p-3">
        <div className="text-xs font-bold uppercase mb-2" style={{ color: C.muted }}>
          Chọn lớp ({allClasses.length} lớp từ tất cả giáo viên)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allClasses.map((sc, i) => (
            <button
              key={`${sc.storageKey}-${sc.classIdx}`}
              onClick={() => { setSelectedIdx(i); resetForm() }}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold"
              style={{
                background: i === selectedIdx ? C.board : C.paper,
                color: i === selectedIdx ? '#fff' : C.ink,
                border: `1px solid ${i === selectedIdx ? C.board : C.line}`,
              }}
            >
              {sc.cls.name}
              <span
                className="ml-1.5 text-xs opacity-60"
              >
                {sc.cls.level === 'primary' ? 'Cấp 1' : 'Cấp 2-3'}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Standard comps — toggle hide/show */}
      <Card className="p-4">
        <div className="text-xs font-bold uppercase mb-3" style={{ color: C.muted }}>
          Tiêu chí gốc — {cls.name} ({baseRubric.label})
        </div>
        <div className="space-y-2">
          {baseRubric.comps.map((comp) => {
            const hidden = hiddenSet.has(comp.key)
            return (
              <div
                key={comp.key}
                className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{
                  background: hidden ? '#F3F4F6' : C.paper,
                  opacity: hidden ? 0.65 : 1,
                  border: `1px solid ${hidden ? C.line : 'transparent'}`,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate" style={{ color: C.ink }}>
                    {comp.label}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                    style={{ background: C.line, color: C.muted }}
                  >
                    {TYPE_LABELS[comp.type as CompType] ?? comp.type}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: C.muted }}>{comp.max}đ</span>
                </div>
                <button
                  onClick={() => toggleHidden(comp.key)}
                  className="shrink-0 ml-3 rounded-lg px-2.5 py-1 text-xs font-bold"
                  style={{
                    color: hidden ? C.board : C.muted,
                    border: `1px solid ${hidden ? C.board : C.line}`,
                    background: hidden ? C.board + '10' : 'transparent',
                  }}
                >
                  {hidden ? '+ Hiện lại' : 'Ẩn'}
                </button>
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
            {extraComps.map((ec) => (
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
                  <button
                    onClick={() => removeComp(ec.key)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold"
                    style={{ color: C.red }}
                  >
                    Xóa
                  </button>
                </div>
                {ec.type === 'choice' && ec.options && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ec.options.map((o) => (
                      <span key={o.id} className="text-xs px-2 py-0.5 rounded-lg" style={{ background: C.board + '12', color: C.board }}>
                        {o.label} · {o.pts}đ
                      </span>
                    ))}
                  </div>
                )}
                {ec.type === 'parts' && ec.parts && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ec.parts.map((p) => (
                      <span key={p.id} className="text-xs px-2 py-0.5 rounded-lg" style={{ background: C.gold + '22', color: '#96720E' }}>
                        {p.label} · {p.max}đ
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
