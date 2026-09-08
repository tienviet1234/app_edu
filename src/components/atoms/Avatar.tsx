type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
  name: string
  emoji?: string
  size?: AvatarSize
  className?: string
}

const SIZE_PX: Record<AvatarSize, number> = { sm: 24, md: 36, lg: 48 }
const FONT_SIZE: Record<AvatarSize, string> = { sm: '0.6rem', md: '0.8rem', lg: '1.05rem' }

// Pastel navy-tone palette — chọn màu nền theo hash tên (deterministic, ổn định giữa các lần render)
const BG_COLORS = ['#DBEAFE', '#E0E7FF', '#F1F5F9', '#E0F2FE', '#EDE9FE', '#F0FDFA']
const FG_COLORS = ['#1E40AF', '#3730A3', '#334155', '#0369A1', '#5B21B6', '#0F766E']

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return hash
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, emoji, size = 'md', className = '' }: AvatarProps) {
  const px = SIZE_PX[size]
  const idx = hashName(name) % BG_COLORS.length

  return (
    <div
      className={'flex shrink-0 items-center justify-center rounded-full font-bold ' + className}
      style={{
        width: px,
        height: px,
        fontSize: FONT_SIZE[size],
        background: BG_COLORS[idx],
        color: FG_COLORS[idx],
      }}
    >
      {emoji ?? initials(name)}
    </div>
  )
}
