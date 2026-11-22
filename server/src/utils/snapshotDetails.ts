/** Chi tiết các buổi CHƯA lên server trong 1 bản chụp máy (localStorage giáo viên/admin).
 *  Trước 19/11 server chỉ đếm số (unsyncedSessionCount): máy HP cô Anh báo "3 buổi" suốt từ
 *  20/10 mà không ai biết là buổi nào, phải tải bản chụp về đọc tay. Giờ lưu luôn em + ngày
 *  vào bản ghi bản chụp, Sức khỏe dữ liệu tự đối chiếu với server. */
export interface UnsyncedDetail {
  classId: string
  className: string
  studentId: string
  studentName: string
  sessionId: string
  no: number
  date: string
  /** temp = chưa từng lên server (id tạm); dirty = đã có trên server, sửa chưa gửi. */
  kind: 'temp' | 'dirty'
  /** Có điểm / ghi chú / điểm danh khác "có mặt" / bài tập. */
  hasData: boolean
  conflict: boolean
}

const isMongoid = (id: unknown) => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)
const MAX = 50

type Snap = { classes?: Array<{ id?: string; name?: string; students?: Array<{ id?: string; name?: string; sessions?: Array<Record<string, unknown>> }> }> }

const nonEmpty = (v: unknown) => !!v && typeof v === 'object' && Object.keys(v as object).length > 0

export function unsyncedDetailsOf(data: unknown): UnsyncedDetail[] {
  const out: UnsyncedDetail[] = []
  for (const c of (data as Snap | null)?.classes ?? []) {
    for (const st of c.students ?? []) {
      for (const s of st.sessions ?? []) {
        const temp = !isMongoid(s.id)
        if (!temp && s.dirty !== true) continue
        const e = (s.entry ?? {}) as Record<string, unknown>
        const hasData = !!String(s.homework ?? '').trim() || (e.attendance != null && e.attendance !== 'present')
          || !!String(e.note ?? '').trim() || ['scores', 'ticks', 'choice', 'parts', 'tags'].some((k) => nonEmpty(e[k]))
        out.push({
          classId: String(c.id ?? ''), className: String(c.name ?? ''), studentId: String(st.id ?? ''), studentName: String(st.name ?? ''),
          sessionId: String(s.id ?? ''), no: Number(s.no) || 0, date: String(s.date ?? '').slice(0, 10),
          kind: temp ? 'temp' : 'dirty', hasData, conflict: !!s.conflict,
        })
        if (out.length >= MAX) return out
      }
    }
  }
  return out
}

/** Mô tả 1 buổi kẹt cho admin, đối chiếu với server (`serverHasDate` = server có buổi còn hiệu lực
 *  của em đó trong lớp đó đúng ngày đó). Lời khuyên khớp đúng việc máy tự làm (settleStuckTemps). */
export function describeUnsynced(d: UnsyncedDetail, serverHasDate: boolean): string {
  const day = d.date ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}` : '?'
  const head = `${d.className} · ${d.studentName} · ${day}`
  if (d.conflict) return `${head}: 2 máy cùng sửa — mở Nhập điểm lớp đó trên máy này để chọn bản giữ`
  if (d.kind === 'dirty') return `${head}: đã sửa trên máy, chưa gửi — mở lớp đó trên máy này để tự gửi`
  if (serverHasDate) return `${head}: bản thừa trùng ngày buổi đã có trên server — máy tự gộp khi mở lớp đó (bản mới)`
  if (d.hasData) return `${head}: có dữ liệu chưa lên server — mở lớp đó trên máy này (bản mới): máy tự gửi, hoặc nếu ngày đó nằm trong kỳ đã thu tiền thì cất vào kho giữ lại, không đổi học phí`
  return `${head}: buổi TRỐNG chỉ có trên máy, server không có — cần quyết: có học thì ghi điểm danh, không thì xóa ở "Sửa số buổi" trên máy đó`
}

/** Máy kẹt từ lúc nào: bản chụp ĐẦU TIÊN sau lần cuối máy về 0 buổi chưa gửi (danh sách mới → cũ). */
export function stuckSinceOf(history: Array<{ createdAt: Date | string; unsyncedSessionCount?: number }>): number | null {
  let since: number | null = null
  for (const h of history) {
    if ((h.unsyncedSessionCount ?? 0) === 0) break
    since = new Date(h.createdAt).getTime()
  }
  return since
}
