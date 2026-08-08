export const round1 = (n: number): number => Math.round(n * 10) / 10

export const todayISO = (): string => new Date().toISOString().slice(0, 10)

export const viDate = (iso: string | null | undefined): string =>
  iso ? iso.split('-').reverse().join('/') : ''
