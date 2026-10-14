import { describe, it, expect } from 'vitest'
import { applyCompExtraItems, getClassRubric, getRubric } from './rubrics'
import type { ClassData, RubricComponent } from '@/types'

// Admin thêm mức/phần mới vào tiêu chí GỐC phải giữ nguyên mức/phần cũ và
// tính lại max đúng — sai chỗ này thì điểm toàn lớp bị lệch, nên test kỹ.

function partsComp(): RubricComponent {
  return {
    key: 'video', label: 'Video bài nói', max: 20, type: 'parts',
    parts: [
      { id: 'a', label: 'Quay đầy đủ', max: 10 },
      { id: 'b', label: 'Phát âm', max: 10 },
    ],
  }
}

function choiceComp(): RubricComponent {
  return {
    key: 'hw', label: 'Bài tập về nhà', max: 30, type: 'choice',
    options: [
      { id: 'full', label: 'Hoàn thành', pts: 30 },
      { id: 'none', label: 'Chưa hoàn thành', pts: 0 },
    ],
  }
}

function scoreComp(): RubricComponent {
  return { key: 'mini', label: 'Mini Test', max: 40, type: 'score' }
}

// Dùng level 'primary' cho các test getClassRubric bên dưới vì "hw" (Bài tập
// về nhà) của Cấp 1 đúng là type 'choice' (3 mức: Hoàn thành 30đ/Hoàn thành
// không đầy đủ 15đ/Chưa hoàn thành 0đ) — khớp với nhu cầu thật (thêm mức 4).
function minimalClass(overrides: Partial<ClassData> = {}): ClassData {
  return {
    id: 'c1', name: 'Lớp 1', teacher: 'T', level: 'primary', perMonth: 8,
    students: [], comments: {},
    ...overrides,
  }
}

describe('applyCompExtraItems', () => {
  it('không có extra items → trả nguyên comp cũ', () => {
    const comp = partsComp()
    expect(applyCompExtraItems(comp, undefined)).toBe(comp)
    expect(applyCompExtraItems(comp, [])).toBe(comp)
  })

  it('type parts: nối thêm phần mới, giữ nguyên phần cũ, cộng lại max', () => {
    const comp = partsComp()
    const result = applyCompExtraItems(comp, [{ id: 'extra_1', label: 'Trình bày', value: 10 }])
    expect(result.parts).toEqual([
      { id: 'a', label: 'Quay đầy đủ', max: 10 },
      { id: 'b', label: 'Phát âm', max: 10 },
      { id: 'extra_1', label: 'Trình bày', max: 10 },
    ])
    expect(result.max).toBe(30)
    // Comp gốc không bị mutate
    expect(comp.parts).toHaveLength(2)
  })

  it('type choice: nối thêm mức mới, max = mức cao nhất trong TẤT CẢ các mức', () => {
    const comp = choiceComp()
    const result = applyCompExtraItems(comp, [{ id: 'extra_1', label: 'Làm thêm nâng cao', value: 35 }])
    expect(result.options).toHaveLength(3)
    expect(result.options?.[2]).toEqual({ id: 'extra_1', label: 'Làm thêm nâng cao', pts: 35 })
    expect(result.max).toBe(35)
  })

  it('type choice: mức mới điểm THẤP hơn mức cũ → max vẫn giữ mức cao nhất cũ', () => {
    const comp = choiceComp()
    const result = applyCompExtraItems(comp, [{ id: 'extra_1', label: 'Nửa chừng', value: 15 }])
    expect(result.max).toBe(30)
  })

  it('type score: không có mức/phần nào để thêm, trả nguyên comp', () => {
    const comp = scoreComp()
    const result = applyCompExtraItems(comp, [{ id: 'extra_1', label: 'X', value: 10 }])
    expect(result).toBe(comp)
  })
})

describe('getClassRubric — lắp ráp compExtraItems cùng các override khác', () => {
  it('lớp không có tùy chỉnh gì → trả nguyên rubric gốc', () => {
    const cls = minimalClass()
    expect(getClassRubric(cls)).toBe(getRubric('primary'))
  })

  it('chỉ có compExtraItems → tiêu chí gốc có thêm mức, các tiêu chí khác không đổi', () => {
    const cls = minimalClass({ compExtraItems: { hw: [{ id: 'extra_1', label: 'Làm thêm nâng cao', value: 35 }] } })
    const r = getClassRubric(cls)
    const hw = r.comps.find((c) => c.key === 'hw')
    expect(hw?.options).toHaveLength(4) // 3 mức gốc (30/15/0) + 1 mức mới
    expect(hw?.options?.at(-1)).toEqual({ id: 'extra_1', label: 'Làm thêm nâng cao', pts: 35 })
    const video = r.comps.find((c) => c.key === 'video')
    expect(video?.max).toBe(30) // không đụng tiêu chí khác
  })

  it('kết hợp compExtraItems + compOverrides cùng lúc: mức mới cũng sửa điểm được qua override', () => {
    const cls = minimalClass({
      compExtraItems: { hw: [{ id: 'extra_1', label: 'Làm thêm nâng cao', value: 35 }] },
      compOverrides: { hw: { extra_1: 50 } }, // admin sửa lại điểm mức vừa thêm
    })
    const r = getClassRubric(cls)
    const hw = r.comps.find((c) => c.key === 'hw')
    expect(hw?.options?.find((o) => o.id === 'extra_1')?.pts).toBe(50)
    expect(hw?.max).toBe(50)
  })

  it('kết hợp compExtraItems + hiddenComps: tiêu chí bị ẩn thì không cần tính extra items của nó', () => {
    const cls = minimalClass({
      hiddenComps: ['hw'],
      compExtraItems: { hw: [{ id: 'extra_1', label: 'X', value: 10 }] },
    })
    const r = getClassRubric(cls)
    expect(r.comps.find((c) => c.key === 'hw')).toBeUndefined()
  })
})
