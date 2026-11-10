import type { Session } from '@/types'
import { viDate } from '@/utils/format'

interface StudentLite { id: string; name: string; sessions: Array<Pick<Session, 'id' | 'date'>> }

/** Kiểm tra trước khi ĐỔI NGÀY (hoặc thêm tay) 1 buổi của 1 em — dùng chung cho mọi
 *  chỗ sửa ngày (Nhập điểm, Lớp học, Thống kê buổi).
 *  - `block`: em đã có 1 buổi KHÁC đúng ngày đó → 2 buổi cùng ngày, kỳ học phí đếm dư
 *    (ca Linh Đan Starters 30/09). Server cũng chặn (dateMoveBlockReason).
 *  - `confirm`: ngày đó cả lớp KHÔNG em nào khác có buổi, trong khi các ngày học quanh
 *    đó cả lớp đều có — dễ là chọn nhầm ngày (sự cố Lớp 7 24/10, 27/10: buổi 29/10 bị
 *    đổi sang ngày lớp không học, sau đó tính tiền). Không chặn vì có học bù riêng thật.
 *  Ngày chưa gõ xong (năm < 2000) thì không hỏi. */
export function dateChangeCheck(
  students: StudentLite[],
  studentId: string,
  sessionId: string | null,
  newDate: string,
): { block?: string; confirm?: string } {
  const st = students.find((s) => s.id === studentId)
  if (!st || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number(newDate.slice(0, 4)) < 2000) return {}
  const clash = st.sessions.find((s) => s.id !== sessionId && s.date === newDate)
  if (clash) return { block: `${st.name} đã có 1 buổi khác ngày ${viDate(newDate)} — 1 em không học 2 buổi cùng ngày. Sửa hoặc xóa buổi kia trước.` }
  const others = students.filter((s) => s.id !== studentId)
  if (others.length < 3) return {}
  if (others.some((s) => s.sessions.some((x) => x.date === newDate))) return {}
  // Ngày học đông (quá nửa lớp có buổi) trong 10 ngày quanh ngày mới.
  const t = Date.parse(`${newDate}T00:00:00Z`)
  const near = new Map<string, number>()
  for (const s of students) for (const x of s.sessions) {
    if (Math.abs(Date.parse(`${x.date}T00:00:00Z`) - t) <= 10 * 864e5) near.set(x.date, (near.get(x.date) ?? 0) + 1)
  }
  const busy = [...near].filter(([, n]) => n > students.length / 2).map(([d]) => d).sort()
  if (!busy.length) return {}
  return {
    confirm: `Ngày ${viDate(newDate)} cả lớp chưa em nào khác có buổi (các ngày lớp học gần đó: ${busy.map(viDate).join(', ')}).\n\n` +
      `Đây là buổi HỌC BÙ RIÊNG của ${st.name}? Bấm OK để vẫn dùng ngày này, Hủy để giữ ngày cũ.`,
  }
}

/** Ngày đã gõ XONG, được phép lưu: đúng dạng YYYY-MM-DD, là ngày có thật, năm ≥ 2000
 *  (đang gõ dở năm thì trình duyệt cho ra "0002-…", "0202-…"). */
export function isCommittableDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number(d.slice(0, 4)) < 2000) return false
  const t = new Date(`${d}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}
