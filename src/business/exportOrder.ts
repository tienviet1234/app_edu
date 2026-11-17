// Bộ đếm buổi theo NGÀY THÁNG NĂM cho file Excel học phí (17/11). Trước đây file xếp các buổi theo
// SỐ BUỔI (cắt theo vị trí trong danh sách) — buổi nào có số không khớp thứ tự ngày (dữ liệu cũ,
// giáo viên tự xếp tay) là ra "Buổi 3 – 05/11" đứng trước "Buổi 4 – 03/11". Thuần, có test.

const TOTAL = 'TỔNG CỘNG'
const isTotal = (r: { status?: string }) => r.status === TOTAL

/** Sắp lại các dòng "Chi tiết từng buổi":
 *  - mỗi học sinh 1 cụm liền nhau (giữ thứ tự học sinh như lúc đưa vào);
 *  - trong 1 kỳ (1 khối dòng, kết thúc bằng dòng "TỔNG CỘNG" nếu có) các buổi theo ngày
 *    `YYYY-MM-DD` — so chuỗi đủ năm nên sang năm mới vẫn đúng; cùng ngày thì theo số buổi;
 *    dòng "TỔNG CỘNG" luôn cuối kỳ của nó;
 *  - nhiều kỳ của cùng 1 em: kỳ nào có buổi sớm hơn đứng trước;
 *  - `seq` = STT đếm 1, 2, 3… theo đúng thứ tự đó cho từng em (dòng tổng để trống). */
export function orderSessionRowsForExport<T extends { studentName: string; date: string; status?: string; sortNo?: number }>(rows: T[]): Array<T & { seq: number | '' }> {
  // 1) Tách khối: dòng liền nhau cùng 1 em, khối đóng lại ở dòng TỔNG CỘNG.
  const blocks: T[][] = []
  for (const r of rows) {
    const last = blocks[blocks.length - 1]
    if (last && last[0].studentName === r.studentName && !isTotal(last[last.length - 1])) last.push(r)
    else blocks.push([r])
  }
  const firstDate = (b: T[]) => b.filter((r) => !isTotal(r) && r.date).map((r) => r.date).sort()[0] ?? '9999-99-99'
  for (const b of blocks) {
    const total = b.filter(isTotal)
    const items = b.filter((r) => !isTotal(r)).sort((a, c) => (a.date || '9999').localeCompare(c.date || '9999') || (a.sortNo ?? 0) - (c.sortNo ?? 0))
    b.splice(0, b.length, ...items, ...total)
  }
  // 2) Gom khối theo em (thứ tự em xuất hiện lần đầu), trong em: khối có buổi sớm hơn trước.
  const order: string[] = []
  const byStudent = new Map<string, T[][]>()
  for (const b of blocks) {
    const k = b[0].studentName
    if (!byStudent.has(k)) { byStudent.set(k, []); order.push(k) }
    byStudent.get(k)!.push(b)
  }
  const out: Array<T & { seq: number | '' }> = []
  for (const k of order) {
    let n = 0
    for (const b of byStudent.get(k)!.sort((a, c) => firstDate(a).localeCompare(firstDate(c)))) {
      for (const r of b) out.push({ ...r, seq: isTotal(r) ? '' : ++n })
    }
  }
  return out
}
