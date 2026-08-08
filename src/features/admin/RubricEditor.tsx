import { useState, type ChangeEvent } from 'react'
import { produce } from 'immer'
import type { ExtraComp } from '@/types'
import { C } from '@/constants/colors'
import { getClassRubric } from '@/constants/rubrics'
import { uid } from '@/utils/uid'
import { useAppStore } from '@/store/appStore'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

export function RubricEditor() {
  const { data, setData, currentClassIndex, setCurrentClass } = useAppStore()
  const [newLabel, setNewLabel] = useState('')
  const [newMax, setNewMax] = useState(10)

  if (!data || !data.classes.length) {
    return (
      <Card className="p-6 text-center">
        <div style={{ color: C.muted }}>Chưa có lớp nào. Giáo viên cần tạo lớp trước.</div>
      </Card>
    )
  }

  const cls = data.classes[currentClassIndex]
  const r = getClassRubric(cls)
  const extraComps = cls.extraComps ?? []

  function addComp() {
    if (!newLabel.trim() || newMax <= 0) return
    setData(produce((d) => {
      const c = d.classes[currentClassIndex]
      if (!c.extraComps) c.extraComps = []
      c.extraComps.push({ key: `custom_${uid()}`, label: newLabel.trim(), max: newMax })
    }))
    setNewLabel('')
    setNewMax(10)
  }

  function removeComp(key: string) {
    setData(produce((d) => {
      const c = d.classes[currentClassIndex]
      c.extraComps = (c.extraComps ?? []).filter((ec: ExtraComp) => ec.key !== key)
    }))
  }

  function updateComp(key: string, field: 'label' | 'max', value: string | number) {
    setData(produce((d) => {
      const c = d.classes[currentClassIndex]
      const found = (c.extraComps ?? []).find((x: ExtraComp) => x.key === key)
      if (!found) return
      if (field === 'max') found.max = Number(value)
      else found.label = String(value)
    }))
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <div className="text-lg font-black" style={{ color: C.ink }}>Tùy chỉnh tiêu chí chấm điểm</div>
        <div className="text-sm mt-1" style={{ color: C.muted }}>
          Thêm hoặc xóa tiêu chí cho từng lớp. Các tiêu chí gốc không thể xóa.
        </div>
      </div>

      {/* Class selector */}
      <Card className="p-3">
        <div className="text-xs font-bold uppercase mb-2" style={{ color: C.muted }}>Chọn lớp</div>
        <div className="flex flex-wrap gap-1.5">
          {data.classes.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setCurrentClass(i)}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold"
              style={{
                background: i === currentClassIndex ? C.board : C.paper,
                color: i === currentClassIndex ? '#fff' : C.ink,
                border: `1px solid ${i === currentClassIndex ? C.board : C.line}`,
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Current rubric (read-only standard comps) */}
      <Card className="p-4">
        <div className="text-xs font-bold uppercase mb-2" style={{ color: C.muted }}>
          Tiêu chí gốc — {cls.name} ({r.label})
        </div>
        <div className="space-y-1.5">
          {r.comps.filter((c) => !c.key.startsWith('custom_')).map((comp) => (
            <div
              key={comp.key}
              className="flex items-center justify-between rounded-xl px-3 py-2 text-sm"
              style={{ background: C.paper }}
            >
              <span className="font-semibold" style={{ color: C.ink }}>{comp.label}</span>
              <span style={{ color: C.muted }}>Max {comp.max} điểm · {comp.type}</span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 text-xs" style={{ color: C.muted }}>
          Tổng điểm gốc: {r.comps.filter((c) => !c.key.startsWith('custom_')).reduce((a, c) => a + c.max, 0)} + Chuyên cần 10
        </div>
      </Card>

      {/* Extra (admin) comps */}
      <Card className="p-4">
        <div className="text-xs font-bold uppercase mb-2" style={{ color: C.muted }}>
          Tiêu chí tùy chỉnh ({extraComps.length})
        </div>

        {extraComps.length === 0 ? (
          <div className="text-sm py-2" style={{ color: C.muted }}>Chưa có tiêu chí tùy chỉnh nào.</div>
        ) : (
          <div className="space-y-2 mb-3">
            {extraComps.map((ec) => (
              <div key={ec.key} className="flex items-center gap-2">
                <input
                  value={ec.label}
                  onChange={(x: ChangeEvent<HTMLInputElement>) => updateComp(ec.key, 'label', x.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-sm"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={ec.max}
                  onChange={(x) => updateComp(ec.key, 'max', x.target.value)}
                  className="w-16 rounded-xl px-2 py-2 text-center text-sm font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span className="text-xs" style={{ color: C.muted }}>điểm</span>
                <button
                  onClick={() => removeComp(ec.key)}
                  className="rounded-lg px-2 py-1 text-xs font-bold"
                  style={{ color: C.red }}
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new component */}
        <div className="flex items-center gap-2 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
          <input
            value={newLabel}
            onChange={(x) => setNewLabel(x.target.value)}
            onKeyDown={(x) => x.key === 'Enter' && addComp()}
            placeholder="Tên tiêu chí (vd: Phát âm)"
            className="flex-1 rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <input
            type="number"
            min="1"
            max="100"
            value={newMax}
            onChange={(x) => setNewMax(Number(x.target.value))}
            className="w-16 rounded-xl px-2 py-2 text-center text-sm font-bold"
            style={{ border: `1px solid ${C.line}` }}
          />
          <span className="text-xs" style={{ color: C.muted }}>điểm</span>
          <Btn kind="solid" onClick={addComp} disabled={!newLabel.trim()}>
            + Thêm
          </Btn>
        </div>
        <div className="mt-2 text-xs" style={{ color: C.muted }}>
          Tiêu chí tùy chỉnh dùng nhập điểm thủ công (loại score). Tổng điểm tùy chỉnh:{' '}
          <b style={{ color: C.ink }}>{extraComps.reduce((a, c) => a + c.max, 0)}</b> điểm.
        </div>
      </Card>
    </div>
  )
}
