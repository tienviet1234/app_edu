export const round1 = (n: number): number => Math.round(n * 10) / 10

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

export const viDate = (iso: string | null | undefined): string =>
  iso ? iso.split('-').reverse().join('/') : ''

/** Returns display info for a session number with monthly cycling */
export function sessionLabel(no: number, perMonth: number): string {
  const month = Math.ceil(no / perMonth)
  const local = ((no - 1) % perMonth) + 1
  return month > 1 ? `Buổi ${local} · T.${month}` : `Buổi ${local}`
}
