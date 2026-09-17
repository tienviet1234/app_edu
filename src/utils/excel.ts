import * as XLSX from 'xlsx'
import type { AppData, ClassData } from '@/types'
import { getClassRubric } from '@/constants/rubrics'
import { statsOf } from '@/business/stats'
import { rankingOf } from '@/business/ranking'
import { sessionScore, compScore } from '@/business/scoring'
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
  const r = getClassRubric(cls)
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

const ATTEND_LABEL_FULL: Record<string, string> = {
  present: 'Có mặt', late: 'Muộn', excused: 'Có phép', absent: 'Vắng',
}

/** Xuất TOÀN BỘ dữ liệu (mọi lớp, mọi học sinh, mọi buổi đã chấm) ra 1 file
 *  Excel dễ đọc — sheet "Tổng quan" liệt kê các lớp, mỗi lớp có 1 sheet
 *  riêng ghi chi tiết từng buổi của từng học sinh. Đây là bản xem/đối chiếu
 *  bằng mắt, KHÔNG dùng để nhập lại vào app (muốn khôi phục đầy đủ, dùng nút
 *  "Xuất file sao lưu" — file .json giữ nguyên cấu trúc để "Nhập lại" đọc được). */
export function exportFullBackupXlsx(data: AppData): void {
  const wb = XLSX.utils.book_new()

  const overviewHeaders = ['Lớp', 'Giáo viên', 'Cấp', 'Số học sinh', 'Tổng số buổi đã chấm']
  const overviewRows = data.classes.map((cls) => [
    cls.name,
    cls.teacher ?? '',
    cls.level,
    cls.students.length,
    cls.students.reduce((a, s) => a + s.sessions.length, 0),
  ])
  const overviewWs = XLSX.utils.aoa_to_sheet([overviewHeaders, ...overviewRows])
  overviewWs['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, overviewWs, 'Tổng quan')

  const usedSheetNames = new Set<string>(['Tổng quan'])
  data.classes.forEach((cls, ci) => {
    const r = getClassRubric(cls)
    const headers = ['STT', 'Học sinh', 'Buổi', 'Ngày', 'Điểm danh', ...r.comps.map((c) => c.label), 'Tổng điểm', 'Ghi chú']

    const rows: (string | number)[][] = []
    let stt = 1
    cls.students.forEach((st) => {
      ;[...st.sessions].sort((a, b) => a.no - b.no).forEach((s) => {
        const total = sessionScore(s.entry, r)
        rows.push([
          stt++,
          st.name,
          s.no,
          s.date,
          ATTEND_LABEL_FULL[s.entry.attendance] ?? s.entry.attendance,
          ...r.comps.map((c) => compScore(c, s.entry)),
          total ?? '',
          s.entry.note ?? '',
        ])
      })
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 5 }, { wch: 20 }, { wch: 7 }, { wch: 12 }, { wch: 12 },
      ...r.comps.map(() => ({ wch: 14 })),
      { wch: 10 }, { wch: 24 },
    ]

    const base = (cls.name || `Lop ${ci + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 28) || `Lop ${ci + 1}`
    let sheetName = base
    let dupCount = 2
    while (usedSheetNames.has(sheetName)) sheetName = `${base}_${dupCount++}`.slice(0, 31)
    usedSheetNames.add(sheetName)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  })

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `sao-luu-hoc-tap-${today}.xlsx`)
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
