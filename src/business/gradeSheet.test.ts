import { describe, it, expect } from 'vitest'
import type { ClassData, Session, SessionEntry } from '@/types'
import { RUBRICS, getClassRubric } from '@/constants/rubrics'
import { emptyEntry } from './seed'
import { sessionScore, sessionComps } from './scoring'
import {
  sheetGroups, cellView, applySheetEdit, paintFor, parseCellNumber, rowProgress, parsePaste, pasteTargets,
  attFromKey, sessionOnDate, dayMaxOf, ratioTotalOf, type SheetColumn,
} from './gradeSheet'

const P = RUBRICS.primary
const S2 = RUBRICS.secondary
const cols = (r: { comps: typeof P.comps }) => sheetGroups(r).flatMap((g) => g.cols)
const col = (r: { comps: typeof P.comps }, id: string): SheetColumn => {
  const c = cols(r).find((x) => x.id === id)
  if (!c) throw new Error('no col ' + id)
  return c
}
const sess = (entry: Partial<SessionEntry> = {}, extra: Partial<Session> = {}): Session => ({ id: 'tmp', no: 1, date: '2026-11-21', entry: { ...emptyEntry(), ...entry }, ...extra })
const total = (r: typeof P, s: Session) => sessionScore(s.entry, { ...r, comps: sessionComps(r, s) })

describe('sheetGroups — cột = đúng tiêu chí phiếu chấm', () => {
  it('Cấp 1: điểm danh · BTVN (mức + kết quả) · Video 3 phần + không nộp · Từ vựng 3 phần + kết quả · Thái độ 5 mục · nhận xét', () => {
    const g = sheetGroups(P)
    expect(g.map((x) => x.key)).toEqual(['att', 'hw', 'video', 'vocab', 'attitude', 'note'])
    expect(g.find((x) => x.key === 'hw')!.cols.map((c) => c.id)).toEqual(['hw:choice', 'hw:ratio:correct'])
    expect(g.find((x) => x.key === 'video')!.cols.map((c) => c.id)).toEqual(['video:part:full', 'video:part:pron', 'video:part:ontime', 'video:skip'])
    expect(g.find((x) => x.key === 'vocab')!.cols.map((c) => c.cell.kind)).toEqual(['part', 'part', 'part', 'ratio'])
    expect(g.find((x) => x.key === 'attitude')!.cols).toHaveLength(5)
    expect(g.find((x) => x.key === 'vocab')!.cols[0].hint).toBe('/8')
  })
  it('Cấp 2–3: Mini Test, Listening là ô điểm; BTVN 4 mục tích + kết quả; Thái độ 5 mục', () => {
    const g = sheetGroups(S2)
    expect(g.find((x) => x.key === 'mini')!.cols.map((c) => c.id)).toEqual(['mini:score'])
    expect(g.find((x) => x.key === 'hw')!.cols.map((c) => c.cell.kind)).toEqual(['tick', 'tick', 'tick', 'tick', 'ratio'])
  })
  it('theo phiếu của LỚP: tiêu chí ẩn không có cột, tiêu chí admin thêm có cột, tên đổi theo lớp', () => {
    const cls = { level: 'primary', hiddenComps: ['video'], extraComps: [{ key: 'x_speak', label: 'Nói', max: 10 }], compLabelOverrides: { vocab: { _label: 'Từ mới' } } } as unknown as ClassData
    const g = sheetGroups(getClassRubric(cls))
    expect(g.map((x) => x.key)).toEqual(['att', 'hw', 'vocab', 'attitude', 'x_speak', 'note'])
    expect(g.find((x) => x.key === 'vocab')!.label).toBe('Từ mới')
    expect(g.find((x) => x.key === 'x_speak')!.cols[0].id).toBe('x_speak:score')
  })
})

describe('paintFor — màu theo mức đạt', () => {
  it('trống / đủ / ≥75% / ≥50% / >0 / 0', () => {
    expect([null, 10, 8, 5, 1, 0].map((v) => paintFor(v, 10))).toEqual(['empty', 'full', 'good', 'mid', 'low', 'zero'])
  })
})

describe('parseCellNumber', () => {
  it('rỗng = xóa, dấu phẩy thập phân, chữ bị từ chối', () => {
    expect(parseCellNumber(' ')).toEqual({ ok: true, value: null })
    expect(parseCellNumber('7,5')).toEqual({ ok: true, value: 7.5 })
    expect(parseCellNumber('8')).toEqual({ ok: true, value: 8 })
    expect(parseCellNumber('-1').ok).toBe(false)
    expect(parseCellNumber('abc').ok).toBe(false)
  })
})

describe('applySheetEdit — ghi đúng cấu trúc như "Chấm từng em"', () => {
  it('ô điểm: quá thang → từ chối, KHÔNG đổi gì, không dirty; hợp lệ → ghi số + dirty; xóa → bỏ ô', () => {
    const s = sess()
    const c = col(S2, 'mini:score')
    expect(applySheetEdit(S2, s, c, '41')).toEqual({ ok: false, reason: 'Mini Test: tối đa 40, đã gõ 41.' })
    expect(s.dirty).toBeUndefined()
    expect(s.entry.scores).toEqual({})
    expect(applySheetEdit(S2, s, c, '35')).toEqual({ ok: true, changed: true })
    expect(s.entry.scores.mini).toBe(35)
    expect(s.dirty).toBe(true)
    expect(applySheetEdit(S2, s, c, '')).toEqual({ ok: true, changed: true })
    expect('mini' in s.entry.scores).toBe(false)
  })
  it('thang theo "Số câu" của ĐÚNG buổi đó (Mini Test hôm nay 30 câu)', () => {
    const s = sess({}, { maxes: { mini: 30 } })
    expect(cellView(S2, s, col(S2, 'mini:score')).max).toBe(30)
    expect(applySheetEdit(S2, s, col(S2, 'mini:score'), '31').ok).toBe(false)
    expect(applySheetEdit(S2, s, col(S2, 'mini:score'), '30').ok).toBe(true)
  })
  it('không đổi giá trị → changed=false, không dirty', () => {
    const s = sess({ scores: { mini: 20 } })
    expect(applySheetEdit(S2, s, col(S2, 'mini:score'), '20')).toEqual({ ok: true, changed: false })
    expect(s.dirty).toBeUndefined()
    const t = sess()
    expect(applySheetEdit(P, t, col(P, 'attitude:tick:pa_speak'), false)).toEqual({ ok: true, changed: false })
    expect(applySheetEdit(P, t, col(P, 'video:skip'), false)).toEqual({ ok: true, changed: false })
    expect(applySheetEdit(P, t, col(P, 'hw:ratio:correct'), '')).toEqual({ ok: true, changed: false })
  })
  it('phần nhỏ: tối đa theo phần; xóa phần cuối thì bỏ hẳn tiêu chí (không thành "đã chấm 0 điểm")', () => {
    const s = sess()
    expect(applySheetEdit(P, s, col(P, 'vocab:part:pron'), '9')).toEqual({ ok: false, reason: 'Từ vựng · Đọc đúng phát âm: tối đa 8, đã gõ 9.' })
    applySheetEdit(P, s, col(P, 'vocab:part:pron'), '7')
    expect(s.entry.parts.vocab).toEqual({ pron: 7 })
    applySheetEdit(P, s, col(P, 'vocab:part:pron'), '')
    expect(s.entry.parts.vocab).toBeUndefined()
  })
  it('"Không nộp" video: khóa 3 ô phần, tổng tính 0 cho video', () => {
    const s = sess()
    applySheetEdit(P, s, col(P, 'video:skip'), true)
    expect(cellView(P, s, col(P, 'video:part:full')).disabled).toBe(true)
    expect(applySheetEdit(P, s, col(P, 'video:part:full'), '5').ok).toBe(false)
    const manual = sess({ skip: { video: true } })
    expect(total(P, s)).toBe(total(P, manual))
  })
  it('tích việc: bật/tắt đúng mục', () => {
    const s = sess()
    applySheetEdit(P, s, col(P, 'attitude:tick:pa_speak'), true)
    applySheetEdit(P, s, col(P, 'attitude:tick:pa_focus'), true)
    applySheetEdit(P, s, col(P, 'attitude:tick:pa_speak'), false)
    expect(s.entry.ticks.attitude).toEqual(['pa_focus'])
  })
  it('mức (lựa chọn): chọn / bỏ chọn; mức không có trong phiếu bị từ chối', () => {
    const s = sess()
    applySheetEdit(P, s, col(P, 'hw:choice'), 'partial')
    expect(s.entry.choice.hw).toBe('partial')
    expect(cellView(P, s, col(P, 'hw:choice')).paint).toBe('mid')
    expect(applySheetEdit(P, s, col(P, 'hw:choice'), 'xyz').ok).toBe(false)
    applySheetEdit(P, s, col(P, 'hw:choice'), '')
    expect('hw' in s.entry.choice).toBe(false)
  })
  it('"Kết quả x/y": mẫu số y hệt EvidenceFields (ô đã ghi → Số câu buổi → 20); quá mẫu số bị từ chối', () => {
    const s = sess({}, { maxes: { hw: 15 } })
    expect(ratioTotalOf(s, 'hw', 'correct')).toBe(15)
    expect(applySheetEdit(P, s, col(P, 'hw:ratio:correct'), '16').ok).toBe(false)
    applySheetEdit(P, s, col(P, 'hw:ratio:correct'), '12')
    expect(s.entry.ev.hw.correct).toEqual({ total: 15, ok: 12 })
    const t = sess({ ev: { vocab: { correct: { ok: 3, total: 12 } } } })
    expect(ratioTotalOf(t, 'vocab', 'correct')).toBe(12)
    expect(ratioTotalOf(sess(), 'vocab', 'correct')).toBe(20)
  })
  it('em nghỉ (có phép / không phép): khóa ô tiêu chí, vẫn đổi được điểm danh và nhận xét', () => {
    const s = sess({ attendance: 'absent' })
    expect(applySheetEdit(S2, s, col(S2, 'mini:score'), '10')).toEqual({ ok: false, reason: 'Em nghỉ buổi này — không chấm tiêu chí.' })
    expect(applySheetEdit(S2, s, col(S2, 'note'), 'ốm').ok).toBe(true)
    expect(applySheetEdit(S2, s, col(S2, 'att'), 'late').ok).toBe(true)
    expect(s.entry.attendance).toBe('late')
  })
  it('buổi chấm theo phiếu cũ (Thái độ Cấp 1 trước 06/10) → khóa, không sửa ở bảng', () => {
    const s = sess({ parts: { attitude: { focus: 4, active: 3 } } })
    const c = col(P, 'attitude:tick:pa_speak')
    expect(cellView(P, s, c)).toMatchObject({ legacy: true, disabled: true })
    expect(applySheetEdit(P, s, c, true).ok).toBe(false)
  })
  it('tổng điểm sau khi chấm trên bảng = tổng khi chấm cùng nội dung ở "Chấm từng em"', () => {
    const s = sess()
    applySheetEdit(P, s, col(P, 'hw:choice'), 'full')
    applySheetEdit(P, s, col(P, 'video:part:full'), '10')
    applySheetEdit(P, s, col(P, 'video:part:pron'), '6')
    applySheetEdit(P, s, col(P, 'vocab:part:mean'), '5')
    for (const id of ['pa_speak', 'pa_focus', 'pa_coop']) applySheetEdit(P, s, col(P, `attitude:tick:${id}`), true)
    const manual = sess({ choice: { hw: 'full' }, parts: { video: { full: '10', pron: '6' }, vocab: { mean: '5' } }, ticks: { attitude: ['pa_speak', 'pa_focus', 'pa_coop'] } })
    expect(total(P, s)).toBe(total(P, manual))
    expect(total(P, s)).not.toBeNull()
  })
})

describe('rowProgress — "đã nhập x/y ô"', () => {
  it('Cấp 1 trống: chỉ có điểm danh; nghỉ thì đủ; "Không nộp" tính đủ 3 phần video', () => {
    const g = sheetGroups(P)
    // điểm danh + BTVN(mức, kết quả) + video(3) + từ vựng(3 + kết quả) + thái độ(1) = 11
    expect(rowProgress(P, sess(), g)).toEqual({ done: 1, total: 11 })
    expect(rowProgress(P, sess({ attendance: 'excused' }), g)).toEqual({ done: 11, total: 11 })
    expect(rowProgress(P, sess({ skip: { video: true }, ticks: { attitude: ['pa_speak'] } }), g)).toEqual({ done: 5, total: 11 })
  })
})

describe('dán từ Google Sheets / Excel', () => {
  it('parsePaste: tab = cột, xuống dòng = dòng, bỏ dòng trống cuối', () => {
    expect(parsePaste('8\t6\r\n7\t5\r\n')).toEqual([['8', '6'], ['7', '5']])
    expect(parsePaste('9')).toEqual([['9']])
  })
  it('pasteTargets: chỉ ô trong bảng, dòng có buổi, cột dán được', () => {
    const cs = cols(P)
    const start = cs.findIndex((c) => c.id === 'vocab:part:pron')
    const rows = [{ studentId: 'a', hasSession: true }, { studentId: 'b', hasSession: false }, { studentId: 'c', hasSession: true }]
    const out = pasteTargets(rows, cs, { row: 0, col: start }, [['8', '6'], ['7', '5'], ['6', '4'], ['1', '1']])
    expect(out.targets).toEqual([
      { studentId: 'a', colId: 'vocab:part:pron', raw: '8' }, { studentId: 'a', colId: 'vocab:part:mean', raw: '6' },
      { studentId: 'c', colId: 'vocab:part:pron', raw: '6' }, { studentId: 'c', colId: 'vocab:part:mean', raw: '4' },
    ])
    expect(out.skipped).toBe(4) // dòng b (2 ô) + dòng thứ 4 ngoài bảng (2 ô)
    const att = pasteTargets(rows, cs, { row: 0, col: 0 }, [['x']])
    expect(att).toEqual({ targets: [], skipped: 1 })
  })
})

describe('phím tắt + buổi theo ngày + số câu trong ngày', () => {
  it('attFromKey', () => {
    expect(['đ', 'D', 'm', 'p', 'K', 'x'].map(attFromKey)).toEqual(['present', 'present', 'late', 'excused', 'absent', null])
  })
  it('sessionOnDate: không có / 1 / trùng ngày', () => {
    const a = { date: '2026-11-21' }, b = { date: '2026-11-21' }, c = { date: '2026-11-20' }
    expect(sessionOnDate([c], '2026-11-21')).toEqual({ kind: 'none' })
    expect(sessionOnDate([a, c], '2026-11-21')).toEqual({ kind: 'one', session: a })
    expect(sessionOnDate([a, b], '2026-11-21')).toEqual({ kind: 'dup', count: 2 })
  })
  it('dayMaxOf: giống nhau / khác nhau / mặc định', () => {
    const comp = { key: 'mini', max: 40 }
    expect(dayMaxOf(comp, [{}, {}])).toEqual({ value: 40, mixed: false, custom: false })
    expect(dayMaxOf(comp, [{ maxes: { mini: 30 } }, { maxes: { mini: 30 } }])).toEqual({ value: 30, mixed: false, custom: true })
    expect(dayMaxOf(comp, [{ maxes: { mini: 30 } }, {}])).toMatchObject({ mixed: true })
  })
})

describe('khung Chi tiết — ghi chú tiêu chí + nhận định', () => {
  it('applyEvidenceText ghi đúng chỗ EvidenceFields ghi; không đổi thì không dirty; nghỉ thì khóa', async () => {
    const { applyEvidenceText } = await import('./gradeSheet')
    const s = sess()
    expect(applyEvidenceText(s, 'vocab', 'pronWords', 'museum')).toEqual({ ok: true, changed: true })
    expect(s.entry.ev.vocab.pronWords).toBe('museum')
    const t = sess({ ev: { vocab: { pronWords: 'x' } } })
    expect(applyEvidenceText(t, 'vocab', 'pronWords', 'x')).toEqual({ ok: true, changed: false })
    expect(t.dirty).toBeUndefined()
    expect(applyEvidenceText(sess({ attendance: 'excused' }), 'vocab', 'pronWords', 'a').ok).toBe(false)
  })
  it('toggleTag bật/tắt nhận định có trong phiếu, từ chối nhận định lạ', async () => {
    const { toggleTag } = await import('./gradeSheet')
    const s = sess()
    toggleTag(S2, s, 'mini', 'm_gram')
    toggleTag(S2, s, 'mini', 'm_spell')
    toggleTag(S2, s, 'mini', 'm_gram')
    expect(s.entry.tags.mini).toEqual(['m_spell'])
    expect(toggleTag(S2, s, 'mini', 'nope').ok).toBe(false)
  })
})

describe('cách xem bảng (chỉ đổi hiển thị)', () => {
  it('readPrefs: dữ liệu hỏng → mặc định', async () => {
    const { readPrefs, DEFAULT_PREFS } = await import('./gradeSheet')
    expect(readPrefs('{bad')).toEqual(DEFAULT_PREFS)
    expect(readPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(readPrefs('{"hidden":["video"],"color":"one","compact":true,"progress":false}')).toEqual({ hidden: ['video'], order: [], color: 'one', compact: true, progress: false })
  })
  it('arrangeGroups: điểm danh đầu, nhận xét cuối, đổi thứ tự, ẩn tiêu chí/cột; điểm danh không ẩn được', async () => {
    const { arrangeGroups } = await import('./gradeSheet')
    const g = sheetGroups(P)
    const out = arrangeGroups(g, { order: ['attitude', 'hw'], hidden: ['video', 'vocab:ratio:correct', 'att'] })
    expect(out.map((x) => x.key)).toEqual(['att', 'attitude', 'hw', 'vocab', 'note'])
    expect(out.find((x) => x.key === 'vocab')!.cols.map((c) => c.cell.kind)).toEqual(['part', 'part', 'part'])
    expect(arrangeGroups(g, { order: [], hidden: [] }).map((x) => x.key)).toEqual(['att', 'hw', 'video', 'vocab', 'attitude', 'note'])
  })
  it('hiddenWithData: cột ẩn mà có dữ liệu thì báo', async () => {
    const { hiddenWithData } = await import('./gradeSheet')
    const g = sheetGroups(P)
    expect(hiddenWithData(P, g, { hidden: ['video'] }, [sess({ parts: { video: { full: 10 } } })])).toEqual(['Video bài nói · Quay đầy đủ theo yêu cầu'])
    expect(hiddenWithData(P, g, { hidden: ['video'] }, [sess()])).toEqual([])
  })
})
