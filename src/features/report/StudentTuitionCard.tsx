import { useState } from 'react'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { classService } from '@/services/classes'
import { effectiveRateOf, studentTuitionNote, type StudentTuitionRule } from '@/business/tuition'

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}đ`

interface Props {
  classId: string
  classRate: number | null
  students: Array<{ id: string; name: string }>
  rules: StudentTuitionRule[]
  /** Chỉ admin đặt/bỏ được; giáo viên của lớp chỉ xem. */
  canEdit: boolean
  onChange: (next: StudentTuitionRule[]) => void
}

/** Học phí RIÊNG từng học sinh trong lớp — giảm em này/tăng em kia. 2 kiểu để
 *  tiền từng buổi luôn khớp tổng: giá riêng/buổi, hoặc giảm/tăng % trên giá lớp.
 *  Bắt buộc lý do; server lưu + ghi nhật ký + lịch sử. Áp dụng cho kỳ CHƯA gửi
 *  phiếu — phiếu đã gửi giữ nguyên số tiền đã ghi. */
export function StudentTuitionCard({ classId, classRate, students, rules, canEdit, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [mode, setMode] = useState<'rate' | 'percent'>('percent')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? '(học sinh đã rời lớp)'
  const num = Number(value.replace(/\s/g, '').replace(',', '.'))
  const preview = studentId && value.trim() && Number.isFinite(num) && classRate != null
    ? effectiveRateOf(classRate, { mode, value: mode === 'percent' ? num : Math.round(num) })
    : null

  const startEdit = (id: string) => {
    const r = rules.find((x) => x.studentId === id)
    setStudentId(id)
    setMode(r?.mode ?? 'percent')
    setValue(r ? String(r.value) : '')
    setReason(r?.reason ?? '')
    setOpen(true)
  }

  const fail = (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Lưu không được — thử lại.', { persist: true })

  const save = async () => {
    if (!studentId || classRate == null) return
    const v = mode === 'percent' ? num : Math.round(num)
    const desc = studentTuitionNote(classRate, { studentId, mode, value: v, reason: reason.trim() })
    if (!confirm(`Đặt học phí riêng cho ${nameOf(studentId)}:\n\n${desc}\n\nÁp dụng cho các kỳ CHƯA gửi phiếu. Phiếu đã gửi giữ nguyên số tiền.`)) return
    setSaving(true)
    try {
      const next = await classService.setStudentTuition(classId, studentId, { mode, value: v, reason: reason.trim() })
      onChange(next.map((t) => ({ ...t, studentId: String(t.studentId) })))
      toast.success(`✓ Đã đặt học phí riêng cho ${nameOf(studentId)}.`)
      setOpen(false)
    } catch (e) { fail(e) } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm(`Bỏ học phí riêng của ${nameOf(id)} — quay về giá lớp${classRate != null ? ` ${vnd(classRate)}/buổi` : ''}?\n\nPhiếu đã gửi giữ nguyên số tiền.`)) return
    setSaving(true)
    try {
      const next = await classService.removeStudentTuition(classId, id)
      onChange(next.map((t) => ({ ...t, studentId: String(t.studentId) })))
      toast.success(`✓ ${nameOf(id)} quay về giá lớp.`)
    } catch (e) { fail(e) } finally { setSaving(false) }
  }

  if (!canEdit && !rules.length) return null
  const input = 'rounded-xl px-3 py-2 text-sm'
  const inputStyle = { border: `1px solid ${C.line}`, background: C.card, color: C.ink }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold" style={{ color: C.ink }}>💲 Học phí riêng từng học sinh ({rules.length})</div>
        {canEdit && classRate != null && !open && (
          <Btn size="sm" kind="outline-primary" onClick={() => { setStudentId(''); setValue(''); setReason(''); setMode('percent'); setOpen(true) }}>+ Đặt học phí riêng</Btn>
        )}
      </div>
      <div className="text-xs" style={{ color: C.muted }}>
        Giảm cho em này / tăng cho em kia so với giá lớp{classRate != null ? ` ${vnd(classRate)}/buổi` : ''}. Áp dụng cho kỳ chưa gửi phiếu — phiếu đã gửi giữ nguyên. Mỗi lần đổi đều ghi nhật ký.
        {canEdit ? '' : ' Chỉ admin được đặt/bỏ.'}
      </div>
      {classRate == null && canEdit && <div className="text-xs" style={{ color: C.red }}>Lớp chưa có giá học phí — đặt giá lớp ở trang Lương & học phí trước.</div>}

      {rules.map((r) => (
        <div key={r.studentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-2 text-sm" style={{ border: `1px solid ${C.line}` }}>
          <span style={{ color: C.ink }}><b>{nameOf(r.studentId)}</b> <span style={{ color: C.muted }}>· {classRate != null ? studentTuitionNote(classRate, r) : r.reason}</span></span>
          {canEdit && (
            <span className="flex gap-2">
              <Btn size="sm" kind="outline-primary" disabled={saving} onClick={() => startEdit(r.studentId)}>Sửa</Btn>
              <Btn size="sm" kind="outline-primary" disabled={saving} onClick={() => void remove(r.studentId)}>Bỏ</Btn>
            </span>
          )}
        </div>
      ))}

      {open && canEdit && classRate != null && (
        <div className="rounded-xl p-3 space-y-2" style={{ background: C.paper }}>
          <div className="flex flex-wrap gap-2">
            <select className={input} style={inputStyle} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">— Chọn học sinh —</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={input} style={inputStyle} value={mode} onChange={(e) => setMode(e.target.value as 'rate' | 'percent')}>
              <option value="percent">Giảm/tăng theo %</option>
              <option value="rate">Giá riêng mỗi buổi</option>
            </select>
            <input className={`${input} w-40`} style={inputStyle} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={mode === 'percent' ? 'VD -10 (giảm 10%)' : 'VD 70000'} />
          </div>
          <input className={`${input} w-full`} style={inputStyle} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do (bắt buộc) — VD: anh em ruột, học bổng, học thêm buổi riêng..." />
          {preview != null && (
            <div className="text-sm" style={{ color: C.ink }}>
              → Giá/buổi của em này: <b>{vnd(preview)}</b> <span style={{ color: C.muted }}>(giá lớp {vnd(classRate)})</span>
            </div>
          )}
          <div className="flex gap-2">
            <Btn size="sm" disabled={saving || !studentId || !value.trim() || !Number.isFinite(num) || !reason.trim()} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Lưu'}</Btn>
            <Btn size="sm" kind="outline-primary" disabled={saving} onClick={() => setOpen(false)}>Hủy</Btn>
          </div>
        </div>
      )}
    </Card>
  )
}
