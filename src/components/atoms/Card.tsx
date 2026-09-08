import { C } from '@/constants/colors'

type CardVariant = 'default' | 'elevated' | 'flat'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  className?: string
  style?: React.CSSProperties
  /** default = shadow-md · elevated = shadow-lg (dùng cho card nổi bật) · flat = chỉ viền, không shadow */
  variant?: CardVariant
  /** Thêm hiệu ứng nhấc lên + shadow đậm khi hover (dùng .card-hover từ index.css) */
  hoverable?: boolean
  /** Viền màu 3px phía trên card, dùng để phân loại nhanh (VD: đỏ = cần chú ý) */
  accentTop?: string
}

const VARIANT_SHADOW: Record<CardVariant, string> = {
  default: 'var(--shadow-md)',
  elevated: 'var(--shadow-lg)',
  flat: 'none',
}

export function Card({
  children,
  className = '',
  style = {},
  variant = 'default',
  hoverable = false,
  accentTop,
  ...rest
}: CardProps) {
  return (
    <div
      className={'rounded-2xl ' + (hoverable ? 'card-hover ' : '') + className}
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        borderTop: accentTop ? `3px solid ${accentTop}` : undefined,
        boxShadow: VARIANT_SHADOW[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
