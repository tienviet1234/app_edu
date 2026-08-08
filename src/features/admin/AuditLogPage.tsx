import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminService } from '@/services/admin'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'

const ACTION_COLOR: Record<string, string> = {
  create: C.board2,
  update: C.blue,
  delete: C.red,
  login: C.gold,
  logout: C.muted,
}

function actionColor(action: string): string {
  const verb = action.split('.')[1] ?? action
  return ACTION_COLOR[verb] ?? C.muted
}

function viTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [resource, setResource] = useState('')
  const [action, setAction] = useState('')

  const params: Record<string, string> = { page: String(page), limit: '30' }
  if (resource) params.resource = resource
  if (action) params.action = action

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => adminService.listAuditLogs(params),
    placeholderData: (prev) => prev,
  })

  const logs = data?.items ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black" style={{ color: C.ink }}>Nhật ký hệ thống</h1>
        <p className="text-sm mt-0.5" style={{ color: C.muted }}>
          {total.toLocaleString('vi')} sự kiện được ghi lại
        </p>
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-wrap gap-2">
        <input
          value={resource}
          onChange={(e) => { setResource(e.target.value); setPage(1) }}
          placeholder="Lọc theo resource (User, Course…)"
          className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        />
        <input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          placeholder="Lọc theo action (user.update…)"
          className="flex-1 min-w-[180px] rounded-xl px-3 py-2 text-sm"
          style={{ border: `1px solid ${C.line}` }}
        />
        {(resource || action) && (
          <Btn onClick={() => { setResource(''); setAction(''); setPage(1) }}>Xóa lọc</Btn>
        )}
      </Card>

      {/* Log list */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-sm" style={{ color: C.muted }}>
            Không có nhật ký nào.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr style={{ background: C.paper }}>
                  {['Thời gian', 'Action', 'Resource', 'Resource ID'].map((h) => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-semibold" style={{ color: C.muted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2 px-4 text-xs tabular-nums whitespace-nowrap" style={{ color: C.muted }}>
                      {viTime(log.createdAt)}
                    </td>
                    <td className="py-2 px-4">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold"
                        style={{
                          background: actionColor(log.action) + '18',
                          color: actionColor(log.action),
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-xs font-medium">{log.resource}</td>
                    <td className="py-2 px-4 text-xs font-mono" style={{ color: C.muted }}>
                      {log.resourceId ? log.resourceId.slice(-8) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Btn disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Btn>
          <span className="px-3 py-2 text-sm" style={{ color: C.muted }}>
            {page} / {totalPages}
          </span>
          <Btn disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Sau →</Btn>
        </div>
      )}
    </div>
  )
}
