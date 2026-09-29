// Bộ biểu tượng vẽ tay (nét đơn, 24×24, cùng độ dày) thay cho emoji — emoji
// hiển thị khác nhau giữa các máy Android/iPhone/Windows, biểu tượng vẽ thì
// luôn giống nhau và ăn theo màu chữ (currentColor).
const PATHS = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  entry: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1z M14 7l3 3',
  homework: 'M6 3h12v18H6z M9 3v18 M12 8h3 M12 12h3',
  chart: 'M4 20v-8 M10 20V5 M16 20v-6 M2 21h20',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H4a3 3 0 0 0 4 4 M16 6h4a3 3 0 0 1-4 4 M12 13v4 M8 20h8 M10 17h4',
  report: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7',
  calendar: 'M4 6h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1 M17 6a3 3 0 0 1 0 6 M21 20v-1a5 5 0 0 0-3-4.5',
  cap: 'M2 9l10-5 10 5-10 5z M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5 M22 9v6',
  school: 'M3 21V9l9-5 9 5v12z M9 21v-6h6v6',
  book: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4',
  child: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  checksq: 'M4 4h16v16H4z M8 12l3 3 5-6',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  cloud: 'M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 17 18z',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12 M18 6L6 18',
  arrowR: 'M4 12h16 M14 6l6 6-6 6',
  arrowL: 'M20 12H4 M10 6l-6 6 6 6',
} as const

export type IconName = keyof typeof PATHS

/** Tên biểu tượng ứng với từng tab điều hướng (khóa tab → biểu tượng). */
export const TAB_ICON: Record<string, IconName> = {
  dashboard: 'dashboard',
  entry: 'entry',
  homework: 'homework',
  'my-scores': 'chart',
  'my-homework': 'homework',
  board: 'trophy',
  report: 'report',
  billing: 'calendar',
  parent: 'users',
  student: 'cap',
  classes: 'school',
  learn: 'book',
  notifications: 'bell',
  'my-child': 'child',
}

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
