import { describe, it, expect } from 'vitest'
import { draftOf, draftView, draftPatch, draftChanges, draftProblems, setLabel, setPoints, toggleHidden, addItem, addComp, earliestEffectiveDate } from './rubricDraft'
import { getClassRubric, compsOn } from '@/constants/rubrics'
import { sessionTotal } from './scoring'
import { emptyEntry } from './seed'
import { planRubricVersion } from '../../server/src/utils/dataRules'
import type { ClassData, RubricVersion, Session, SessionEntry } from '@/types'

const entry = (over: Partial<SessionEntry> = {}): SessionEntry => ({ ...emptyEntry(), ...over })
const sess = (id: string, date: string, e: SessionEntry): Session => ({ id, no: 1, date, homework: '', entry: e })
const cls = (over: Partial<ClassData> = {}): ClassData => ({
  id: 'c1', name: 'Lớp 2', teacher: '', level: 'primary', perMonth: 8, comments: {},
  students: [{ id: 's1', name: 'An', sessions: [
    sess('a', '2026-11-18', entry({ choice: { hw: 'full' }, parts: { video: { full: 10, pron: 10, ontime: 10 } } })),
    sess('b', '2026-11-20', entry({ choice: { hw: 'partial' }, parts: { vocab: { pron: 8 } } })),
    sess('c', '2026-11-22', entry({ attendance: 'excused' })), // không chấm → không tính là "đã chấm"
  ] }],
  ...over,
})
const asCls = (c: ClassData, d: ReturnType<typeof draftOf>): ClassData => ({ ...c, ...d })

describe('sửa tiêu chí trên Bảng chấm điểm (đợt 2b) — ghi đúng cấu trúc màn Admin', () => {
  it('chưa sửa gì → không có gì để lưu, không có thay đổi', () => {
    const c = cls({ compOverrides: { hw: { full: 30 } } })
    const d = draftOf(c)
    expect(draftPatch(c, d)).toEqual({})
    expect(draftChanges(c, d)).toEqual([])
  })

  it('đổi điểm 1 mức tiêu chí gốc → compOverrides; đổi về đúng điểm gốc → bỏ ghi đè', () => {
    const c = cls()
    const d = setPoints(c, draftOf(c), 'hw', 'full', 20)
    expect(d.compOverrides).toEqual({ hw: { full: 20 } })
    expect(draftChanges(c, d)).toContain('"Bài tập về nhà" · "Hoàn thành": 30 → 20 điểm.')
    const back = setPoints(c, d, 'hw', 'full', 30)
    expect(back.compOverrides).toEqual({})
    expect(draftPatch(c, back)).toEqual({})
  })

  it('đổi tên tiêu chí / tên mức → compLabelOverrides (_label cho tên tiêu chí)', () => {
    const c = cls()
    let d = setLabel(c, draftOf(c), 'hw', null, 'BTVN')
    d = setLabel(c, d, 'hw', 'full', 'Làm đủ')
    expect(d.compLabelOverrides).toEqual({ hw: { _label: 'BTVN', full: 'Làm đủ' } })
    expect(getClassRubric(asCls(c, d)).comps.find((x) => x.key === 'hw')!.label).toBe('BTVN')
  })

  it('thêm mục vào tiêu chí gốc → compExtraItems (giữ mức cũ); tiêu chí "Điểm số" không thêm được', () => {
    const c = cls()
    const d = addItem(c, draftOf(c), 'attitude', 'Giữ trật tự', 4)
    expect(d.compExtraItems.attitude).toEqual([expect.objectContaining({ label: 'Giữ trật tự', value: 4 })])
    const att = getClassRubric(asCls(c, d)).comps.find((x) => x.key === 'attitude')!
    expect(att.items!.at(-1)!.label).toBe('Giữ trật tự')
    expect(draftChanges(c, d).some((l) => l.includes('thêm mục "Giữ trật tự" 4đ'))).toBe(true)
    const sec = cls({ name: 'Lớp 7', level: 'secondary' })
    expect(addItem(sec, draftOf(sec), 'mini', 'x', 1)).toEqual(draftOf(sec))
  })

  it('thêm tiêu chí mới + ẩn được cả tiêu chí tự thêm', () => {
    const c = cls()
    const d = addComp(draftOf(c), 'choice', 'Đọc sách', 10)
    const key = d.extraComps[0].key
    expect(key.startsWith('custom_')).toBe(true)
    expect(getClassRubric(asCls(c, d)).comps.at(-1)!.label).toBe('Đọc sách')
    expect(draftChanges(c, d)).toContain('Thêm tiêu chí "Đọc sách" (tối đa 10).')
    const hidden = toggleHidden(d, key)
    expect(getClassRubric(asCls(c, hidden)).comps.some((x) => x.key === key)).toBe(false)
    expect(draftView(c, hidden).find((x) => x.key === key)!.hidden).toBe(true)
  })

  it('ẩn tiêu chí gốc → báo rõ chỉ áp từ ngày áp dụng', () => {
    const c = cls()
    const d = toggleHidden(draftOf(c), 'video')
    expect(draftChanges(c, d)).toEqual(['Ẩn "Video bài nói" — buổi từ ngày áp dụng không chấm mục này.'])
    expect(draftPatch(c, d)).toEqual({ hiddenComps: ['video'] })
  })

  it('lỗi chặn lưu: tên trống, điểm âm / không phải số, tiêu chí tối đa 0 điểm', () => {
    const c = cls()
    expect(draftProblems(c, setLabel(c, draftOf(c), 'hw', null, '  '))).toContain('Có tiêu chí chưa có tên.')
    expect(draftProblems(c, setPoints(c, draftOf(c), 'hw', 'full', -1)).some((p) => p.includes('điểm phải là số'))).toBe(true)
    expect(draftProblems(c, setPoints(c, draftOf(c), 'hw', 'full', Number.NaN)).length).toBeGreaterThan(0)
    const zero = addComp(draftOf(c), 'score', 'Mới', 0)
    expect(draftProblems(c, zero).some((p) => p.includes('tối đa phải lớn hơn 0'))).toBe(true)
  })

  it('ngày áp dụng sớm nhất ở máy = đúng quy tắc server (buổi chấm cuối 20/11, hôm nay 21/11 → 21/11; buổi vắng phép 22/11 không tính)', () => {
    const c = cls()
    const today = '2026-11-21'
    const server = planRubricVersion({ current: {}, patch: { hiddenComps: ['video'] }, versions: [], today, lastGradedDate: '2026-11-20' })
    expect(earliestEffectiveDate(c, today)).toBe('2026-11-21')
    expect(server.ok && server.from).toBe('2026-11-21')
    // Có phiên bản muộn hơn → không sớm hơn phiên bản đó.
    expect(earliestEffectiveDate(cls({ rubricVersions: [{ until: '2026-12-01' }] }), today)).toBe('2026-12-01')
    expect(earliestEffectiveDate(c, '2026-11-19')).toBe('2026-11-21')
  })

  it('LƯU thật (server cất phiên bản): MỌI buổi đã chấm giữ nguyên tổng, buổi từ ngày áp dụng theo phiếu mới', () => {
    const c = cls({ compOverrides: { hw: { full: 30, partial: 15, none: 0 } } })
    let d = setPoints(c, draftOf(c), 'hw', 'partial', 5)
    d = toggleHidden(d, 'video')
    d = addItem(c, d, 'attitude', 'Giữ trật tự', 4)
    const today = '2026-11-21'
    const patch = draftPatch(c, d)
    const plan = planRubricVersion({ current: c as unknown as Record<string, unknown>, patch, versions: [], today, lastGradedDate: '2026-11-20' })
    expect(plan.ok).toBe(true)
    if (!plan.ok || !plan.snapshot) return
    const saved: ClassData = { ...c, ...patch, rubricVersions: [JSON.parse(JSON.stringify(plan.snapshot)) as RubricVersion] }
    const rBefore = getClassRubric(c)
    const rAfter = getClassRubric(saved)
    for (const s of c.students[0].sessions) expect(sessionTotal(rAfter, s)).toBe(sessionTotal(rBefore, s))
    // Buổi mới ngày áp dụng: theo phiếu mới (không còn Video, BTVN "một phần" 5đ).
    expect(compsOn(rAfter, plan.from!).some((x) => x.key === 'video')).toBe(false)
    expect(compsOn(rAfter, '2026-11-20').some((x) => x.key === 'video')).toBe(true)
  })
})
