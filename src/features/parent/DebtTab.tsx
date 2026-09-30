import { useEffect, useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { debtService, DEBT_KIND_LABEL, type Debt } from '@/services/debts'
import { viDate } from '@/utils/format'
import { toast } from '@/store/toastStore'

interface Props {
  classId: string
  studentId: string
  className?: string
  teacherName?: string
}

const STATUS_BADGE: Record<Debt['status'], { label: string; bg: string; color: string }> = {
  pending: { label: '⏳ Chưa trả', bg: '#FEE2E2', color: '#991B1B' },
  submitted: { label: '📤 Đã nộp, chờ cô xác nhận', bg: '#FEF3C7', color: '#7A5A05' },
  cleared: { label: '✓ Đã xong', bg: '#ECFDF5', color: '#059669' },
}

function DebtCard({ debt, onSubmitted }: { debt: Debt; onSubmitted: (d: Debt) => void }) {
  const [draft, setDraft] = useState(debt.answerText ?? '')
  const [saving, setSaving] = useState(false)
  const done = debt.status === 'cleared'

  async function submit() {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const updated = await debtService.submit(debt._id, draft.trim())
      onSubmitted(updated)
      toast.success('Đã nộp — chờ cô xem qua và xác nhận.')
    } catch {
      toast.error('Lỗi khi nộp — thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4" style={done ? { opacity: 0.7 } : undefined}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold" style={{ color: C.muted }}>{DEBT_KIND_LABEL[debt.kind]}</div>
          <div className="mt-0.5 text-sm font-bold" style={{ color: C.ink }}>{debt.label}</div>
          <div className="mt-1 text-xs" style={{ color: C.muted }}>Ghi ngày {viDate(debt.createdAt.slice(0, 10))}</div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: STATUS_BADGE[debt.status].bg, color: STATUS_BADGE[debt.status].color }}
        >
          {STATUS_BADGE[debt.status].label}
        </span>
      </div>

      {!done && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={debt.kind === 'vocab' ? 'Gõ list từ + nghĩa, VD:\nBreeze, gió nhẹ\nHollow, rỗng...' : 'Gõ nội dung trả nợ...'}
            rows={4}
            className="w-full resize-y rounded-xl px-3 py-2 text-sm"
            style={{ border: `1px solid ${C.line}` }}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: C.muted }}>
              {debt.status === 'submitted' ? 'Đã nộp — vẫn sửa/nộp lại được nếu cô chưa xác nhận.' : ''}
            </span>
            <Btn kind="solid" size="sm" onClick={submit} disabled={saving || !draft.trim()}>
              {saving ? 'Đang nộp...' : 'Nộp trả nợ'}
            </Btn>
          </div>
        </div>
      )}
      {done && debt.answerText && (
        <div className="mt-2 whitespace-pre-line text-xs" style={{ color: C.muted }}>{debt.answerText}</div>
      )}
    </Card>
  )
}

/** Danh sách "nợ bài tập" của ĐÚNG 1 học sinh — dùng chung cho cả màn học
 *  sinh tự xem (studentId = chính mình) lẫn phụ huynh xem (studentId = con). */
export function DebtTab({ classId, studentId, className, teacherName }: Props) {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setDebts(await debtService.list({ classId, studentId }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [classId, studentId])

  if (loading) return <div className="py-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>

  const classInfo = (className || teacherName) && (
    <div className="flex flex-wrap gap-x-3 text-xs" style={{ color: C.muted }}>
      {className && <span>🏫 Lớp: <b>{className}</b></span>}
      {teacherName && <span>👩‍🏫 GV: <b>{teacherName}</b></span>}
    </div>
  )

  // Nợ chưa xong lên trước để dễ thấy, đã xong dồn xuống cuối.
  const sorted = [...debts].sort((a, b) => Number(a.status === 'cleared') - Number(b.status === 'cleared'))

  if (!debts.length)
    return (
      <div className="space-y-2">
        {classInfo}
        <div className="py-8 text-center text-sm" style={{ color: C.muted }}>🎉 Không có khoản nợ nào.</div>
      </div>
    )

  return (
    <div className="space-y-3">
      {classInfo}
      {sorted.map((d) => (
        <DebtCard key={d._id} debt={d} onSubmitted={(updated) => setDebts((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))} />
      ))}
    </div>
  )
}
