import { C } from '@/constants/colors'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  className?: string
  style?: React.CSSProperties
}

export function Card({ children, className = '', style = {}, ...rest }: CardProps) {
  return (
    <div
      className={'rounded-2xl ' + className}
      style={{
        background: C.card,
        border: `1px solid ${C.line}`,
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
