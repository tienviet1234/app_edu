import { C } from '@/constants/colors'

type BtnKind = 'solid' | 'ghost' | 'gold' | 'danger' | 'success' | 'outline-primary'
type BtnSize = 'sm' | 'md' | 'lg'

interface BtnProps {
  children: React.ReactNode
  onClick?: () => void
  kind?: BtnKind
  size?: BtnSize
  loading?: boolean
  className?: string
  title?: string
  disabled?: boolean
  /** Mặc định 'button' — Btn không phải lúc nào cũng là nút submit thật của
   *  form, nhưng nếu không khai báo, trình duyệt tự coi mọi <button> trong
   *  <form> là type="submit" và kích hoạt gửi form khi bấm nhầm. Chỉ truyền
   *  'submit' khi đây thực sự là nút submit của form. */
  type?: 'button' | 'submit'
}

const STYLES: Record<BtnKind, React.CSSProperties> = {
  solid: {
    background: C.board,
    color: '#fff',
    border: `1px solid ${C.board}`,
  },
  ghost: {
    background: '#fff',
    color: C.ink,
    border: `1px solid ${C.line}`,
  },
  gold: {
    background: C.gold,
    color: '#1C0F00',
    border: `1px solid ${C.gold}`,
  },
  danger: {
    background: '#FEF2F2',
    color: C.red,
    border: '1px solid #FECACA',
  },
  success: {
    background: '#ECFDF5',
    color: '#059669',
    border: '1px solid #6EE7B7',
  },
  'outline-primary': {
    background: 'transparent',
    color: C.board,
    border: `1px solid ${C.board}`,
  },
}

const SIZE_CLASS: Record<BtnSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  // md/lg cao tối thiểu 44px (vùng chạm cho ngón tay); sm giữ nhỏ cho chỗ dày đặc trên màn hình lớn.
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-11 px-4 py-2.5 text-base',
}

export function Btn({
  children, onClick, kind = 'ghost', size = 'md', loading = false,
  className = '', title, disabled, type = 'button',
}: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled || loading}
      className={
        'rounded-md font-semibold transition-all active:scale-[0.98] disabled:opacity-50 hover:brightness-[0.93] ' +
        SIZE_CLASS[size] + ' ' + className
      }
      style={STYLES[kind]}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
          {children}
        </span>
      ) : children}
    </button>
  )
}
