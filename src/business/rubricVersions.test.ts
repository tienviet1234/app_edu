import { describe, it, expect } from 'vitest'
import { getClassRubric, compsOn, rubricOn } from '@/constants/rubrics'
import { sessionComps, sessionTotal } from './scoring'
import { emptyEntry } from './seed'
import { planRubricVersion } from '../../server/src/utils/dataRules'
import type { ClassData, RubricVersion, SessionEntry } from '@/types'

// Đợt 2 (23/11): sửa tiêu chí chỉ áp từ ngày chọn trở đi — buổi đã chấm giữ đúng cách tính cũ.
const cls = (over: Partial<ClassData> = {}): ClassData => ({
  id: 'c1', name: 'Lớp 2', teacher: '', level: 'primary', perMonth: 8, students: [], comments: {},
  compOverrides: { hw: { full: 30, partial: 15, none: 0 } }, ...over,
})
const entry = (over: Partial<SessionEntry> = {}): SessionEntry => ({ ...emptyEntry(), ...over })
// Buổi chấm: BTVN "một phần", Video đủ.
const graded = entry({ choice: { hw: 'partial' }, parts: { video: { full: 10, pron: 10, ontime: 10 } } })

describe('phiếu chấm có phiên bản — buổi cũ giữ cách tính cũ', () => {
  it('lớp CHƯA từng sửa phiếu (không có phiên bản) → y hệt trước đây, mọi ngày', () => {
    const r = getClassRubric(cls())
    expect(r.history).toBeUndefined()
    expect(compsOn(r, '2026-01-01')).toBe(r.comps)
    expect(sessionComps(r, { date: '2026-09-01' })).toEqual(sessionComps(r, {}))
  })

  it('buổi TRƯỚC ngày áp dụng tính theo phiếu cũ, từ ngày đó theo phiếu mới', () => {
    const before = cls()
    const after = cls({
      compOverrides: { hw: { full: 20, partial: 5, none: 0 } },
      rubricVersions: [{ until: '2026-11-24', level: 'primary', compOverrides: before.compOverrides }],
    })
    const rOld = getClassRubric(before)
    const rNew = getClassRubric(after)
    // 23/11 (trước ngày áp dụng): đúng tổng như khi chưa sửa.
    expect(sessionTotal(rNew, { date: '2026-11-23', entry: graded })).toBe(sessionTotal(rOld, { date: '2026-11-23', entry: graded }))
    // 24/11: theo phiếu mới (BTVN "một phần" chỉ còn 5/20) → khác.
    expect(sessionTotal(rNew, { date: '2026-11-24', entry: graded })).not.toBe(sessionTotal(rOld, { date: '2026-11-24', entry: graded }))
  })

  it('ẩn tiêu chí từ ngày mới: buổi cũ vẫn tính tiêu chí đó', () => {
    const v: RubricVersion = { until: '2026-11-24', level: 'primary', hiddenComps: [] }
    const r = getClassRubric(cls({ hiddenComps: ['video'], rubricVersions: [v] }))
    expect(compsOn(r, '2026-11-23').some((c) => c.key === 'video')).toBe(true)
    expect(compsOn(r, '2026-11-24').some((c) => c.key === 'video')).toBe(false)
    expect(rubricOn(r, '2026-11-23').comps.some((c) => c.key === 'video')).toBe(true)
  })

  it('nhiều phiên bản: chọn phiên bản đầu tiên có until > ngày buổi', () => {
    const r = getClassRubric(cls({
      compOverrides: { hw: { full: 10 } },
      rubricVersions: [
        { until: '2026-12-01', compOverrides: { hw: { full: 20 } } },
        { until: '2026-11-24', compOverrides: { hw: { full: 30 } } },
      ],
    }))
    const hwMax = (d: string) => compsOn(r, d).find((c) => c.key === 'hw')!.options!.find((o) => o.id === 'full')!.pts
    expect([hwMax('2026-11-20'), hwMax('2026-11-24'), hwMax('2026-11-30'), hwMax('2026-12-01')]).toEqual([30, 20, 20, 10])
  })

  it('phiên bản cũ không ghi cấp (null) → tự nhận theo tên lớp lúc đó', () => {
    const r = getClassRubric(cls({ name: 'Lớp 7', level: 'secondary', rubricVersions: [{ until: '2026-11-24', level: null }] }))
    // Lớp 7 = Cấp 2&3 dù trường level cũ bỏ trống.
    expect(compsOn(r, '2026-11-01').map((c) => c.key)).toEqual(getClassRubric(cls({ name: 'Lớp 7', level: 'secondary', compOverrides: undefined })).comps.map((c) => c.key))
  })

  it('"Số câu" của buổi vẫn áp lên đúng phiên bản phiếu của buổi đó', () => {
    const r = getClassRubric(cls({ compOverrides: { hw: { full: 20 } }, rubricVersions: [{ until: '2026-11-24', compOverrides: { hw: { full: 30 } } }] }))
    expect(sessionComps(r, { date: '2026-11-23', maxes: { hw: 12 } }).find((c) => c.key === 'hw')!.max).toBe(12)
  })

  it('đối chiếu SERVER: bản phiếu server cất (planRubricVersion) đưa vào máy → buổi cũ ra ĐÚNG tổng như trước khi sửa', () => {
    const before = cls({ hiddenComps: ['vocab'], compLabelOverrides: { hw: { _label: 'BTVN' } }, compExtraItems: { hw: [{ id: 'x1', label: 'Làm thêm', value: 35 }] } })
    const patch = { hiddenComps: [], compOverrides: { hw: { full: 25, partial: 10, none: 0 } } }
    const plan = planRubricVersion({ current: before as unknown as Record<string, unknown>, patch, versions: [], today: '2026-11-23', lastGradedDate: '2026-11-23' })
    expect(plan.ok && plan.snapshot?.until).toBe('2026-11-24')
    if (!plan.ok || !plan.snapshot) return
    const after = cls({ ...before, ...patch, rubricVersions: [JSON.parse(JSON.stringify(plan.snapshot)) as RubricVersion] })
    const rOld = getClassRubric(before)
    const rNew = getClassRubric(after)
    for (const e of [graded, entry({ choice: { hw: 'x1' } }), entry({ attendance: 'late', choice: { hw: 'none' } })]) {
      expect(sessionTotal(rNew, { date: '2026-11-23', entry: e })).toBe(sessionTotal(rOld, { date: '2026-11-23', entry: e }))
    }
    expect(compsOn(rNew, '2026-11-23').map((c) => c.label)).toEqual(rOld.comps.map((c) => c.label))
  })
})
