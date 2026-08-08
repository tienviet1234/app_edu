import { C } from '@/constants/colors'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  className?: string
  style?: React.CSSProperties
}

export function Card({ children, className = '', style = {}, ...rest }: CardProps) {
  return (
    <div
      className={'rounded-2xl ' + className}
      style={{ background: C.card, border: `1px solid ${C.line}`, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}
