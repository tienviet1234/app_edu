import * as XLSX from 'xlsx'

export interface ImportedSessionRow {
  topic: string
  book: string
  homework: string
  /** YYYY-MM-DD — dòng không có ngày học (buổi chưa dạy) đã bị lọc bỏ sẵn. */
  date: string
  note: string
}

const HEADER_PATTERNS = {
  topic: /tên bài|chủ đề/i,
  book: /sách bài học|student.?s book/i,
  homework: /bài tập về nhà/i,
  date: /ngày học|ngày/i,
  note: /nhận xét|đóng góp|ghi chú|đóng/i,
}

function toISODate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = String(v).trim()
  // dd/mm/yyyy — định dạng ngày phổ biến trong các file Excel theo dõi của giáo viên
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Đọc file Excel theo dõi buổi học (1 học sinh) — tự dò đúng dòng tiêu đề
 *  thật (có thể không phải dòng 1 nếu có dòng tên sách/tiêu đề lớn merge
 *  phía trên, VD "Global success 5") bằng cách tìm dòng có đủ cột "Bài tập
 *  về nhà" + "Ngày học". Bỏ qua các dòng chưa có ngày học (buổi chưa dạy,
 *  VD ghi "off") — không bịa buổi không có thật. */
export async function parseSessionImportFile(file: File): Promise<ImportedSessionRow[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerRowIdx = -1
  let col = { topic: -1, book: -1, homework: -1, date: -1, note: -1 }
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i].map((c) => String(c))
    const homework = row.findIndex((c) => HEADER_PATTERNS.homework.test(c))
    const date = row.findIndex((c) => HEADER_PATTERNS.date.test(c))
    if (homework >= 0 && date >= 0) {
      headerRowIdx = i
      col = {
        topic: row.findIndex((c) => HEADER_PATTERNS.topic.test(c)),
        book: row.findIndex((c) => HEADER_PATTERNS.book.test(c)),
        homework,
        date,
        note: row.findIndex((c) => HEADER_PATTERNS.note.test(c)),
      }
      break
    }
  }
  if (headerRowIdx < 0) {
    throw new Error('Không tìm thấy cột "Bài tập về nhà" và "Ngày học" trong file — kiểm tra lại tiêu đề cột.')
  }

  const cell = (row: unknown[], idx: number): string => (idx >= 0 ? String(row[idx] ?? '').trim() : '')

  return aoa
    .slice(headerRowIdx + 1)
    .map((row) => ({
      topic: cell(row, col.topic),
      book: cell(row, col.book),
      homework: cell(row, col.homework),
      date: toISODate(row[col.date]) ?? '',
      note: cell(row, col.note),
    }))
    .filter((r) => r.date)
}
