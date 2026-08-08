import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parentService, type Child } from '@/services/parent'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'

// ── Màu điểm danh ────────────────────────────────────────────
const ATTEND: Record<string, { label: string; bg: string; color: string }> = {
  present: { label: 'P',  bg: '#D1FAE5', color: '#065F46' },
  late:    { label: 'M',  bg: '#FEF9C3', color: '#854D0E' },
  excused: { label: 'P*', bg: '#DBEAFE', color: '#1E40AF' },
  absent:  { label: 'V',  bg: '#FEE2E2', color: '#991B1B' },
}

// ── Hiển thị 1 thẻ học sinh ─────────────────────────────────
function ChildCard({ child, onUnlink }: { child: Child; onUnlink: () => void }) {
  const [expanded, setExpanded] = useState(false)

  const totalSessions = child.classes.reduce((a, c) => a + c.sessionCount, 0)
  const totalPresent  = child.classes.reduce((a, c) => a + c.presentCount, 0)
  const allAvgs       = child.classes.map((c) => c.avg).filter((a): a is number => a !== null)
  const overallAvg    = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) : null

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      {/* Header */}
      <div
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: C.board }}
        onClick={() => setExpanded((x) => !x)}
      >
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ffffff33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {child.avatar ?? '🎓'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{child.name}</div>
          <div style={{ fontSize: '.75rem', color: '#ffffffaa' }}>{child.email}</div>
        </div>
        <div style={{ textAlign: 'right', color: '#fff' }}>
          {overallAvg !== null && (
            <div style={{ fontSize: '1.4rem', fontWeight: 900, lineHeight: 1 }}>{overallAvg}</div>
          )}
          <div style={{ fontSize: '.65rem', opacity: .7 }}>điểm TB</div>
        </div>
        <span style={{ color: '#ffffff99', fontSize: '.8rem', marginLeft: 8 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: C.line }}>
        {[
          { label: 'Buổi đã học', value: totalSessions },
          { label: 'Có mặt', value: `${totalPresent}/${totalSessions}` },
          { label: 'Số lớp', value: child.classes.length },
        ].map((s) => (
          <div key={s.label} style={{ padding: '10px 0', textAlign: 'center', background: C.paper }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: C.ink }}>{s.value}</div>
            <div style={{ fontSize: '.65rem', color: C.muted, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Expanded: class breakdown */}
      {expanded && (
        <div style={{ padding: 16 }}>
          {child.classes.length === 0 ? (
            <p style={{ color: C.muted, fontSize: '.82rem', textAlign: 'center' }}>Con chưa tham gia lớp nào.</p>
          ) : (
            child.classes.map((cls) => (
              <div key={cls.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '.9rem', color: C.ink }}>{cls.name}</span>
                    {cls.teacher && <span style={{ fontSize: '.72rem', color: C.muted, marginLeft: 6 }}>· GV: {cls.teacher}</span>}
                  </div>
                  {cls.avg !== null && (
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: C.board }}>{cls.avg} <span style={{ fontSize: '.65rem', fontWeight: 400, color: C.muted }}>TB</span></span>
                  )}
                </div>

                {/* Attendance dots */}
                {cls.recentSessions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {cls.recentSessions.map((s, i) => {
                      const a = ATTEND[s.attendance] ?? ATTEND.present
                      return (
                        <div
                          key={i}
                          title={`${new Date(s.date).toLocaleDateString('vi-VN')} · ${s.total} điểm`}
                          style={{
                            width: 30, height: 30, borderRadius: 6,
                            background: a.bg, color: a.color,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: '.55rem', fontWeight: 700, lineHeight: 1.1,
                            cursor: 'default',
                          }}
                        >
                          <span>{a.label}</span>
                          {s.attendance !== 'absent' && s.attendance !== 'excused' && (
                            <span style={{ fontSize: '.6rem', marginTop: 1 }}>{s.total}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Score bar */}
                {cls.recentSessions.filter((s) => s.attendance !== 'absent' && s.attendance !== 'excused').length > 1 && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 32 }}>
                    {cls.recentSessions
                      .filter((s) => s.attendance !== 'absent' && s.attendance !== 'excused')
                      .map((s, i) => {
                        const pct = Math.max(4, (s.total / 100) * 100)
                        return (
                          <div
                            key={i}
                            title={`${s.total} điểm`}
                            style={{
                              flex: 1, height: `${pct}%`, borderRadius: '3px 3px 0 0',
                              background: s.total >= 85 ? C.board2 ?? '#10B981' : s.total >= 70 ? C.gold : C.red ?? '#EF4444',
                              minWidth: 6,
                            }}
                          />
                        )
                      })}
                  </div>
                )}
              </div>
            ))
          )}

          <button
            onClick={onUnlink}
            style={{ marginTop: 8, fontSize: '.72rem', color: C.muted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Hủy kết nối tài khoản này
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────
export function ParentPortalScreen() {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: parentService.getChildren,
  })

  const link = useMutation({
    mutationFn: parentService.linkChild,
    onSuccess: () => {
      setEmail('')
      setErr('')
      qc.invalidateQueries({ queryKey: ['parent-children'] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setErr(msg ?? 'Không tìm thấy tài khoản. Kiểm tra lại email.')
    },
  })

  const unlink = useMutation({
    mutationFn: parentService.unlinkChild,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-children'] }),
  })

  if (isLoading) {
    return <div style={{ padding: 32, textAlign: 'center', color: C.muted }}>Đang tải...</div>
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: C.ink, marginBottom: 4 }}>
          Theo dõi kết quả học tập của con
        </div>
        <div style={{ fontSize: '.82rem', color: C.muted }}>
          Kết nối với tài khoản học sinh bằng email con đã dùng để đăng ký.
        </div>
      </div>

      {/* Link form */}
      <Card style={{ marginBottom: 24, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 10, color: C.ink }}>
          ➕ Thêm con vào danh sách theo dõi
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErr('') }}
            onKeyDown={(e) => e.key === 'Enter' && link.mutate(email)}
            placeholder="Email tài khoản học sinh của con..."
            type="email"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: `1px solid ${err ? '#EF4444' : C.line}`,
              fontSize: '.85rem', color: C.ink, background: C.paper, outline: 'none',
            }}
          />
          <button
            onClick={() => link.mutate(email)}
            disabled={!email.trim() || link.isPending}
            style={{
              padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: '.82rem',
              background: C.board, color: '#fff', border: 'none', cursor: 'pointer',
              opacity: !email.trim() || link.isPending ? .5 : 1,
            }}
          >
            {link.isPending ? '...' : 'Kết nối'}
          </button>
        </div>
        {err && <div style={{ fontSize: '.75rem', color: '#EF4444', marginTop: 6 }}>{err}</div>}
        {link.isSuccess && (
          <div style={{ fontSize: '.75rem', color: '#10B981', marginTop: 6 }}>
            ✓ Đã kết nối thành công!
          </div>
        )}
      </Card>

      {/* Children list */}
      {children.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: '.85rem' }}>
          Chưa có tài khoản nào được kết nối.<br />
          Nhập email của con để bắt đầu theo dõi.
        </div>
      ) : (
        children.map((child) => (
          <ChildCard
            key={child.id}
            child={child}
            onUnlink={() => unlink.mutate(child.id)}
          />
        ))
      )}
    </div>
  )
}
