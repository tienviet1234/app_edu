import { useEffect, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { isMongoid } from '@/utils/mongoid'
import { debtService, DEBT_KIND_LABEL, type Debt, type DebtKind } from '@/services/debts'
import { viDate } from '@/utils/format'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface DebtScreenProps {
  cls: ClassData
}

const STATUS_BADGE: Record<Debt['status'], { label: string; bg: string; color: string }> = {
  pending: { label: '⏳ Chưa trả', bg: '#FEE2E2', color: '#991B1B' },
  submitted: { label: '📤 Đã nộp, chờ duyệt', bg: '#FEF3C7', color: '#7A5A05' },
  cleared: { label: '✓ Đã xong', bg: '#ECFDF5', color: '#059669' },
}

/** Ghi nợ mới cho 1 học sinh cụ thể — khác "Giao bài tập" (cả lớp, 1 hạn
 *  chung), cái này là từng em riêng, phát sinh bất kỳ lúc nào (BTVN trễ,
 *  chép phạt, từ vựng nợ...), giống cách giáo viên đang ghi trên Facebook. */
function NewDebtForm({ cls, onCreated }: { cls: ClassData; onCreated: () => void }) {
  const [studentId, setStudentId] = useState(cls.students[0]?.id ?? '')
  const [kind, setKind] = useState<DebtKind>('other')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!studentId || !label.trim()) return
    setSaving(true)
    try {
      await debtService.create({ classId: cls.id, studentId, kind, label: label.trim() })
      setLabel('')
      toast.success('Đã ghi nợ — học sinh/phụ huynh sẽ nhận được thông báo.')
      onCreated()
    } catch {
      toast.error('Lỗi khi ghi nợ — thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm font-bold" style={{ color: C.ink }}>+ Ghi nợ mới</div>
      <div className="flex flex-wrap gap-2">
        <select
          value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}
        >
          {cls.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={kind} onChange={(e) => setKind(e.target.value as DebtKind)}
          className="rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}
        >
          {(Object.keys(DEBT_KIND_LABEL) as DebtKind[]).map((k) => <option key={k} value={k}>{DEBT_KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <input
        type="text" value={label} onChange={(e) => setLabel(e.target.value)}
        placeholder='VD: "Chưa nộp chép phạt cấu trúc 26/9"'
        className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}` }}
      />
      <Btn kind="solid" size="sm" onClick={save} disabled={saving || !studentId || !label.trim()}>
        {saving ? 'Đang lưu...' : 'Ghi nợ'}
      </Btn>
    </Card>
  )
}

export function DebtScreen({ cls }: DebtScreenProps) {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Debt['status']>('all')

  async function load() {
    setLoading(true)
    try {
      setDebts(await debtService.list({ classId: cls.id }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [cls.id])

  if (!isMongoid(cls.id)) {
    return (
      <div className="rounded-2xl p-6 text-center text-sm" style={{ background: C.paper, color: C.muted }}>
        Lớp này chưa đồng bộ lên máy chủ — cần lớp đã lưu trên server để ghi nợ bài tập.
      </div>
    )
  }

  const studentName = (id: string) => cls.students.find((s) => s.id === id)?.name ?? '(học sinh đã xoá)'
  const shown = filter === 'all' ? debts : debts.filter((d) => d.status === filter)
  const counts = {
    pending: debts.filter((d) => d.status === 'pending').length,
    submitted: debts.filter((d) => d.status === 'submitted').length,
    cleared: debts.filter((d) => d.status === 'cleared').length,
  }

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    try {
      await fn()
      toast.success(okMsg)
      load()
    } catch {
      toast.error('Lỗi — thử lại.')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-black" style={{ color: C.ink }}>📌 Nợ bài tập — {cls.name}</h1>
        <p className="text-sm" style={{ color: C.muted }}>
          Ghi nhận riêng từng học sinh chưa nộp/chưa làm — học sinh/phụ huynh trả nợ bằng cách gõ nội dung, bạn xem qua rồi xác nhận.
        </p>
      </div>

      <NewDebtForm cls={cls} onCreated={load} />

      <div className="flex flex-wrap gap-2">
        {([
          ['all', `Tất cả (${debts.length})`],
          ['pending', `Chưa trả (${counts.pending})`],
          ['submitted', `Chờ duyệt (${counts.submitted})`],
          ['cleared', `Đã xong (${counts.cleared})`],
        ] as const).map(([key, text]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold"
            style={{
              background: filter === key ? C.board : C.paper,
              color: filter === key ? '#fff' : C.muted,
              border: `1px solid ${filter === key ? C.board : C.line}`,
            }}
          >
            {text}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: C.muted }}>Đang tải...</div>
      ) : shown.length === 0 ? (
        <Card className="p-8 text-center text-sm" style={{ color: C.muted }}>Không có khoản nợ nào.</Card>
      ) : (
        shown.map((d) => (
          <Card key={d._id} className="p-4" style={d.status === 'cleared' ? { opacity: 0.7 } : undefined}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold" style={{ color: C.ink }}>{studentName(d.studentId)}</div>
                <div className="text-xs font-semibold" style={{ color: C.muted }}>{DEBT_KIND_LABEL[d.kind]}</div>
                <div className="mt-0.5 text-sm" style={{ color: C.ink }}>{d.label}</div>
                <div className="mt-1 text-xs" style={{ color: C.muted }}>Ghi ngày {viDate(d.createdAt.slice(0, 10))}</div>
              </div>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: STATUS_BADGE[d.status].bg, color: STATUS_BADGE[d.status].color }}
              >
                {STATUS_BADGE[d.status].label}
              </span>
            </div>

            {d.answerText && (
              <div className="mt-2 whitespace-pre-line rounded-lg p-2 text-xs" style={{ background: C.paper, color: C.ink }}>
                {d.answerText}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {d.status !== 'cleared' && (
                <Btn kind="ghost" size="sm" onClick={() => act(() => debtService.clear(d._id), 'Đã xác nhận xong.')}>
                  ✓ Xác nhận xong
                </Btn>
              )}
              {d.status === 'submitted' && (
                <Btn kind="ghost" size="sm" onClick={() => act(() => debtService.reject(d._id), 'Đã trả lại — chờ nộp lại.')}>
                  ↩ Trả lại (chưa đạt)
                </Btn>
              )}
              <button
                className="text-xs" style={{ color: C.muted }}
                onClick={() => act(() => debtService.remove(d._id), 'Đã xoá.')}
              >
                🗑 Xoá
              </button>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
