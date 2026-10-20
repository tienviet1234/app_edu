export const round1 = (n: number): number => Math.round(n * 10) / 10

/** "YYYY-MM-DD" theo NGÀY TRÊN MÁY (giờ Việt Nam), không phải UTC. Trước đây
 *  dùng toISOString() (UTC) → từ 0:00 tới 6:59 sáng ở VN (UTC+7), "hôm nay"
 *  vẫn là HÔM QUA → buổi mới tạo lúc nửa đêm/sáng sớm bị gắn lùi 1 ngày. */
export const localISODate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayISO = (): string => localISODate(new Date())

/** Ngày cách hôm nay N ngày (lùi về quá khứ), dạng ISO "YYYY-MM-DD" — dùng làm
 *  mốc cắt cho xếp hạng "kỳ trước" / cửa sổ "gần đây" khi mỗi học sinh có
 *  chuỗi buổi học riêng (không còn so theo chỉ số buổi chung được nữa). */
export const daysAgoISO = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localISODate(d)
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
