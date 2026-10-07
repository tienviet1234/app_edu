import * as XLSX from 'xlsx'

export interface ImportedSessionRow {
  topic: string
  book: string
  homework: string
  /** YYYY-MM-DD — dòng không có ngày học (buổi chưa dạy) đã bị lọc bỏ sẵn. */
  date: string
  note: string
  /** Số buổi ghi ĐÚNG trong cột "Số buổi học"/"Buổi học theo tháng" của CHÍNH
   *  học sinh này trong Excel — null nếu ô đó trống/không phải số. Lấy nguyên
   *  văn, KHÔNG tự đánh số lại theo ngày, vì đây là số thật giáo viên đã dùng. */
  sourceNo: number | null
}

const TOPIC_PATTERN = /tên bài|chủ đề/i
const BOOK_PATTERN = /sách bài học|student.?s book/i
const HOMEWORK_PATTERN = /bài tập về nhà/i
const NO_PATTERN = /buổi học/i
const DATE_PATTERN = /ngày học|ngày/i

interface StudentGroup {
  studentName: string
  noCol: number
  dateCol: number
  noteCol: number
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

const norm = (s: string) => s.trim().toLowerCase()

/** Đọc file Excel theo dõi buổi học — file dùng CHUNG CHO CẢ LỚP, mỗi học
 *  sinh có 1 cụm 3 cột riêng lặp lại ngang bảng: "Buổi học theo tháng" |
 *  "Ngày học" | <Tên học sinh> (tên học sinh là chính TIÊU ĐỀ cột ghi chú,
 *  VD "Đông", "Bảo Anh" — xem ảnh mẫu thật trong trao đổi). Cột "Tên bài/Chủ
 *  đề", "Sách bài học", "Bài tập về nhà" dùng CHUNG cho cả lớp (chỉ 1 cột).
 *
 *  TRƯỚC ĐÂY bộ đọc này luôn lấy cụm cột ĐẦU TIÊN tìm thấy, bất kể đang nhập
 *  cho học sinh nào — nếu dùng chung 1 file cho cả lớp sẽ lấy NHẦM ngày/buổi
 *  của học sinh khác. Giờ bắt buộc khớp đúng TÊN học sinh đang nhập (`studentName`)
 *  với tiêu đề cụm cột, báo lỗi rõ nếu không khớp — không bao giờ đoán bừa.
 *  Vẫn chạy được với file CHỈ CÓ 1 học sinh (không cần khớp tên, dùng cụm duy nhất). */
export async function parseSessionImportFile(file: File, studentName: string): Promise<ImportedSessionRow[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerRowIdx = -1
  let topicCol = -1
  let bookCol = -1
  let homeworkCol = -1
  let groups: StudentGroup[] = []

  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i].map((c) => String(c))
    const homework = row.findIndex((c) => HOMEWORK_PATTERN.test(c))
    const firstDate = row.findIndex((c) => DATE_PATTERN.test(c))
    if (homework < 0 || firstDate < 0) continue
    headerRowIdx = i
    topicCol = row.findIndex((c) => TOPIC_PATTERN.test(c))
    bookCol = row.findIndex((c) => BOOK_PATTERN.test(c))
    homeworkCol = homework
    // Mỗi cụm học sinh bắt đầu ở cột khớp "Buổi học..." — cột kế tiếp là
    // "Ngày học", cột kế nữa là tên học sinh (tiêu đề cột ghi chú).
    row.forEach((cell, c) => {
      if (!NO_PATTERN.test(cell)) return
      const dateCol = c + 1
      const noteCol = c + 2
      if (!DATE_PATTERN.test(row[dateCol] ?? '')) return
      groups.push({ studentName: String(aoa[i][noteCol] ?? '').trim(), noCol: c, dateCol, noteCol })
    })
    break
  }

  if (headerRowIdx < 0) {
    throw new Error('Không tìm thấy cột "Bài tập về nhà" và "Ngày học" trong file — kiểm tra lại tiêu đề cột.')
  }
  if (!groups.length) {
    throw new Error('Không tìm thấy cột "Buổi học theo tháng" đi kèm "Ngày học" trong file.')
  }

  let group = groups[0]
  if (groups.length > 1) {
    const found = groups.find((g) => norm(g.studentName) === norm(studentName))
    if (!found) {
      throw new Error(
        `File này có nhiều học sinh nhưng không tìm thấy cột tên "${studentName}" — ` +
        `các tên có trong file: ${groups.map((g) => g.studentName || '(trống)').join(', ')}. ` +
        'Kiểm tra lại tên cột trong Excel có khớp đúng tên học sinh trong app không.',
      )
    }
    group = found
  }

  const cell = (row: unknown[], idx: number): string => (idx >= 0 ? String(row[idx] ?? '').trim() : '')

  return aoa
    .slice(headerRowIdx + 1)
    .map((row) => {
      const noRaw = Number(cell(row, group.noCol))
      return {
        topic: cell(row, topicCol),
        book: cell(row, bookCol),
        homework: cell(row, homeworkCol),
        date: toISODate(row[group.dateCol]) ?? '',
        note: cell(row, group.noteCol),
        sourceNo: Number.isFinite(noRaw) && noRaw > 0 ? noRaw : null,
      }
    })
    .filter((r) => r.date)
}
