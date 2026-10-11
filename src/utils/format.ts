export const round1 = (n: number): number => Math.round(n * 10) / 10

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

/** Ngày cách hôm nay N ngày (lùi về quá khứ), dạng ISO "YYYY-MM-DD" — dùng làm
 *  mốc cắt cho xếp hạng "kỳ trước" / cửa sổ "gần đây" khi mỗi học sinh có
 *  chuỗi buổi học riêng (không còn so theo chỉ số buổi chung được nữa). */
export const daysAgoISO = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export const viDate = (iso: string | null | undefined): string =>
  iso ? iso.split('-').reverse().join('/') : ''

/** Định dạng đầy đủ ngày + giờ, VD: "07/09/2026 23:59" */
export function viDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Chuỗi dùng cho input[type=datetime-local], theo giờ địa phương (không phải UTC) */
export function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
