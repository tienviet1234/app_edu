import { useQuery } from '@tanstack/react-query'
import { backupService, type HealthItem } from '@/services/backups'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const LEVEL: Record<HealthItem['level'], { label: string; color: string }> = {
  ok: { label: 'Ổn', color: C.emerald },
  warn: { label: 'Cần xem', color: C.gold },
  bad: { label: 'Cần xử lý ngay', color: C.red },
}

const SUMMARY: Record<HealthItem['level'], string> = {
  ok: 'Các lớp bảo vệ dữ liệu đang hoạt động bình thường.',
  warn: 'Có mục cần xem lại, dữ liệu chưa nguy hiểm.',
  bad: 'Có mục cần xử lý ngay.',
}

/** Admin tự mở khi cần, không tự hiện lúc mở app. */
export function DataHealthCard() {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['admin', 'data-health'],
    queryFn: backupService.dataHealth,
    staleTime: 60_000,
  })

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-bold" style={{ color: C.ink }}>Sức khỏe dữ liệu</div>
          <div className="text-sm" style={{ color: error ? C.red : data ? LEVEL[data.level].color : C.muted }}>
            {error ? 'Không đọc được, chưa kết luận được. Bấm Kiểm tra lại.' : data ? SUMMARY[data.level] : 'Đang kiểm tra...'}
          </div>
        </div>
        <Btn size="sm" loading={isFetching} onClick={() => void refetch()}>Kiểm tra lại</Btn>
      </div>
      {data?.items.map((item, i) => (
        <div key={item.key} className="py-2 text-sm" style={i ? { borderTop: `1px solid ${C.line}` } : undefined}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold" style={{ color: C.ink }}>{item.title}</span>
            <span className="text-xs font-bold" style={{ color: LEVEL[item.level].color }}>{LEVEL[item.level].label}</span>
          </div>
          <div style={{ color: C.muted }}>{item.detail}</div>
          {!!item.lines?.length && (
            <ul className="mt-1 space-y-0.5 text-xs" style={{ color: C.ink }}>
              {item.lines.slice(0, 100).map((line) => <li key={line}>{line}</li>)}
              {item.lines.length > 100 && <li style={{ color: C.muted }}>và {item.lines.length - 100} dòng nữa</li>}
            </ul>
          )}
        </div>
      ))}
    </Card>
  )
}
