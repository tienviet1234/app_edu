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

/** Export scores for all students in a class period as .xlsx */
export function exportScores(cls: ClassData, p: ExportPeriod): void {
  const r = getRubric(cls.level)
  const ranking = rankingOf(cls, p.to)

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
    const s = statsOf(cls, st.id, p.from, p.to)
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

/** Export attendance sheet for all sessions as .xlsx */
export function exportAttendance(cls: ClassData): void {
  const ATTEND_LABEL: Record<string, string> = {
    present: 'P',
    late: 'M',
    excused: 'P*',
    absent: 'V',
  }

  const headers = [
    'STT',
    'Học sinh',
    ...cls.sessions.map((s) => `B${s.no}\n${s.date}`),
    'Tổng buổi',
    'Vắng',
    'Muộn',
    'Có phép',
  ]

  const rows = cls.students.map((st, i) => {
    const marks = cls.sessions.map((s) => ATTEND_LABEL[s.entries[st.id]?.attendance ?? 'absent'] ?? '')
    const absent = cls.sessions.filter((s) => s.entries[st.id]?.attendance === 'absent').length
    const late = cls.sessions.filter((s) => s.entries[st.id]?.attendance === 'late').length
    const excused = cls.sessions.filter((s) => s.entries[st.id]?.attendance === 'excused').length
    return [i + 1, st.name, ...marks, cls.sessions.length, absent, late, excused]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [{ wch: 5 }, { wch: 20 }, ...cls.sessions.map(() => ({ wch: 6 })), { wch: 9 }, { wch: 6 }, { wch: 6 }, { wch: 8 }]

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
