import * as XLSX from 'xlsx'
import type { ClassData } from '@/types'
import { getRubric } from '@/constants/rubrics'
import { statsOf } from '@/business/stats'
import { rankingOf } from '@/business/ranking'
import { round1 } from '@/utils/format'

export interface ExportPeriod {
  from: number
  to: number
  label: string
}

/** Export scores for all students in a class period as .xlsx.
 *  p.from/p.to là chỉ số buổi RIÊNG của từng học sinh (mỗi em có buổi khác
 *  nhau) — áp cùng khoảng chỉ số cho mọi học sinh; xếp hạng dùng chuẩn hiện
 *  tại (không gắn với 1 mốc ngày cụ thể của kỳ, để đơn giản và luôn nhất quán). */
export function exportScores(cls: ClassData, p: ExportPeriod): void {
  const r = getRubric(cls.level)
  const ranking = rankingOf(cls)

  const headers = [
    'STT',
    'Học sinh',
    ...r.comps.map((c) => c.label),
    'Chuyên cần',
    'Tổng điểm',
    'Xếp hạng',
    'Chuỗi',
    'BTVN',
  ]

  const rows = cls.students.map((st, i) => {
    const s = statsOf(cls, st.sessions.slice(p.from, p.to))
    const place = ranking.find((x) => x.student.id === st.id)?.place ?? '-'
    return [
      i + 1,
      st.name,
      ...r.comps.map((c) => round1(s.catAvg[c.key])),
      round1(s.attendScore),
      round1(s.monthTotal),
      place,
      s.streak,
      `${Math.round(s.hwRate * 100)}%`,
    ]
  })

  // Sort by total score descending
  rows.sort((a, b) => Number(b[r.comps.length + 3]) - Number(a[r.comps.length + 3]))

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Column widths
  ws['!cols'] = [
    { wch: 5 },
    { wch: 20 },
    ...r.comps.map(() => ({ wch: 14 })),
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, p.label.replace(/[\\/?*[\]:]/g, '_'))
  XLSX.writeFile(wb, `${cls.name}_${p.label}_diemso.xlsx`)
}

/** Export attendance sheet — cột là HỢP các ngày xuất hiện ở bất kỳ học sinh
 *  nào (mỗi em có buổi riêng), ô trống (không phải "Vắng") cho ngày học sinh
 *  đó không có buổi học. */
export function exportAttendance(cls: ClassData): void {
  const ATTEND_LABEL: Record<string, string> = {
    present: 'P',
    late: 'M',
    excused: 'P*',
    absent: 'V',
  }

  const dateSet = new Set<string>()
  cls.students.forEach((st) => st.sessions.forEach((s) => dateSet.add(s.date)))
  const dates = [...dateSet].sort()

  const headers = ['STT', 'Học sinh', ...dates, 'Tổng buổi', 'Vắng', 'Muộn', 'Có phép']

  const rows = cls.students.map((st, i) => {
    const byDate = new Map(st.sessions.map((s) => [s.date, s]))
    const marks = dates.map((d) => {
      const s = byDate.get(d)
      return s ? (ATTEND_LABEL[s.entry.attendance] ?? '') : ''
    })
    const absent = st.sessions.filter((s) => s.entry.attendance === 'absent').length
    const late = st.sessions.filter((s) => s.entry.attendance === 'late').length
    const excused = st.sessions.filter((s) => s.entry.attendance === 'excused').length
    return [i + 1, st.name, ...marks, st.sessions.length, absent, late, excused]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 5 }, { wch: 20 }, ...dates.map(() => ({ wch: 10 })), { wch: 9 }, { wch: 6 }, { wch: 6 }, { wch: 8 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Điểm danh')
  XLSX.writeFile(wb, `${cls.name}_diemdanh.xlsx`)
}

/** Parse first column of uploaded .xlsx/.xls/.csv as student names */
export async function importStudentNames(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1 }) as (string | number)[][]

  return rows
    .map((row) => String(row[0] ?? '').trim())
    .filter((name) => name.length > 1 && isNaN(Number(name)))
}
