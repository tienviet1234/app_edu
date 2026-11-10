import type { Session } from '@/types'
import { sessionLabelOf } from './tuition'

/** Sắp xếp buổi học theo đúng thứ tự ngày học thật — cùng ngày thì giữ theo
 *  số buổi (`no`) hiện tại để thứ tự ổn định, không đổi lung tung giữa các
 *  lần gọi khác nhau. */
export function sortSessionsByDate<T extends Pick<Session, 'id' | 'date' | 'no'>>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)
}

/** Tính số buổi ĐÚNG (1..N liên tục, không bỏ số, không trùng) theo đúng thứ
 *  tự ngày học thật — trả về map sessionId → số buổi mới, KHÔNG tự ghi gì cả.
 *  Dùng cho nút "💡 Gợi ý: điền sẵn theo thứ tự ngày học"
 *  (`ResequenceSessionsModal`) và khi sửa dữ liệu bị lệch số hàng loạt (xem
 *  gotcha "Lớp 7 bị sai buổi" ở CLAUDE.md — 1 lần lưu đổi chéo số buổi bị lỗi
 *  mạng giữa chừng để lại buổi kẹt ở số tạm/dải +1000, phải xếp lại từ đầu). */
export function sequentialNumbering<T extends Pick<Session, 'id' | 'date' | 'no'>>(
  sessions: T[],
): Record<string, number> {
  return Object.fromEntries(sortSessionsByDate(sessions).map((s, i) => [s.id, i + 1]))
}

// ── Số buổi luôn 1..n liên tục trong MỖI lớp (quy định admin 10/11) ─────────────────────────
// Y HỆT `numberingProblem`/`planRemoveFromNumbering` ở server (`server/src/utils/dataRules.ts`) —
// có test đối chiếu 2 phía. Máy kiểm tra TRƯỚC khi gửi để giáo viên thấy lỗi ngay, server vẫn
// kiểm tra lại (máy cũ / gửi tay không qua được).

/** Dãy số buổi của 1 em trong 1 lớp có đúng 1..n không (không trùng, không trống, không vượt). */
export function numberingProblemOf(nos: number[], perMonth: number, offset = 0): string | null {
  const n = nos.length
  const seen = new Map<number, number>()
  for (const x of nos) seen.set(x, (seen.get(x) ?? 0) + 1)
  const dup = [...seen].filter(([, c]) => c > 1).map(([x]) => x).sort((a, b) => a - b)
  if (dup.length) return `có 2 buổi cùng số ${dup.map((x) => sessionLabelOf(x, perMonth, offset)).join(', ')}`
  const out = nos.filter((x) => !Number.isInteger(x) || x < 1 || x > n).sort((a, b) => a - b)
  const missing = Array.from({ length: n }, (_, i) => i + 1).filter((x) => !seen.has(x))
  if (out.length || missing.length) {
    return `số buổi phải liên tục từ 1 tới ${n}${missing.length ? ` — đang thiếu ${missing.map((x) => sessionLabelOf(x, perMonth, offset)).join(', ')}` : ''}${out.length ? ` — vượt quá: ${out.map((x) => sessionLabelOf(x, perMonth, offset)).join(', ')}` : ''}`
  }
  return null
}

/** "Tháng k · Buổi m" (giáo viên gõ) → số buổi thật. Sai (m ngoài 1..8/12, ra số < 1) → lý do. */
export function lessonNoFromLabel(
  period: number, m: number, perMonth: number, offset = 0,
): { ok: true; no: number } | { ok: false; reason: string } {
  const size = perMonth === 8 ? 8 : 12
  if (!Number.isInteger(period) || period < 1) return { ok: false, reason: 'Tháng phải là số nguyên từ 1 trở lên' }
  if (!Number.isInteger(m) || m < 1 || m > size) return { ok: false, reason: `Buổi trong tháng phải từ 1 tới ${size} (lớp này ${size} buổi/tháng)` }
  const no = (period - 1) * size + m - offset
  if (no < 1) return { ok: false, reason: `Tháng ${period} · Buổi ${m}/${size} nằm trước khi em vào lớp (em đã học ${offset} buổi trước đó)` }
  return { ok: true, no }
}

/** Bỏ 1 buổi (xóa mềm): các buổi phía sau lùi 1 số — không để trống (server làm y hệt). */
export function renumberAfterRemoval(existing: Array<{ id: string; no: number }>, removeId: string): Array<{ id: string; from: number; to: number }> {
  const gone = existing.find((s) => s.id === removeId)
  if (!gone) return []
  return existing.filter((s) => s.id !== removeId && s.no > gone.no).sort((a, b) => a.no - b.no).map((s) => ({ id: s.id, from: s.no, to: s.no - 1 }))
}

/** Gỡ 1 buổi khỏi máy sau khi xóa. Buổi đã lên server: server đã lùi số các buổi phía sau
 *  trong CÙNG giao dịch xóa → máy làm y hệt (không thì hiện số trống tới lần đồng bộ sau).
 *  Buổi chỉ có trên máy: server không biết, không lùi. Mọi màn xóa buổi đi qua hàm này. */
export function removeSessionLocally(student: { sessions: Session[] }, sessionId: string, wasOnServer: boolean): void {
  const shifts = wasOnServer ? renumberAfterRemoval(student.sessions, sessionId) : []
  student.sessions = student.sessions.filter((s) => s.id !== sessionId)
  for (const sh of shifts) {
    const x = student.sessions.find((s) => s.id === sh.id)
    if (x) x.no = sh.to
  }
}

/** Buổi mới ngày `date` sẽ mang số mấy — Y HỆT server tạo theo ngày (`planInsertSession`): ngay
 *  sau buổi có số lớn nhất trong các buổi ngày ≤ ngày mới, các buổi sau lùi 1 số. Để hiện trước
 *  "sẽ thành Tháng 2 · Buổi 1/8" khi thêm buổi. */
export function insertNoByDate(existing: Array<{ no: number; date: string }>, date: string): number {
  const before = existing.filter((s) => s.date <= date)
  return before.length ? Math.max(...before.map((s) => s.no)) + 1 : 1
}
