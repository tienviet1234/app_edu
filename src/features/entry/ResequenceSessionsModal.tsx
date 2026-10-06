import { useEffect, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { sessionService } from '@/services/sessions'
import { logActivity } from '@/services/activity'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'

interface Props {
  cls: ClassData
  studentId: string
  update: (fn: (c: ClassData) => void) => void
  onClose: () => void
}

interface Applied {
  sessionId: string
  oldNo: number
  newNo: number
}

// Nhớ "lần sửa gần nhất" qua localStorage để nút Hoàn tác vẫn dùng được sau
// khi đóng màn hình/tải lại trang — chỉ giữ 1 lần sửa gần nhất mỗi học sinh.
const undoKey = (studentId: string) => `resequence-undo:${studentId}`

function loadUndo(studentId: string): Applied[] | null {
  try {
    const raw = localStorage.getItem(undoKey(studentId))
    return raw ? (JSON.parse(raw) as Applied[]) : null
  } catch {
    return null
  }
}

function saveUndo(studentId: string, applied: Applied[] | null) {
  try {
    if (applied) localStorage.setItem(undoKey(studentId), JSON.stringify(applied))
    else localStorage.removeItem(undoKey(studentId))
  } catch {
    // best effort — không chặn luồng chính nếu localStorage bị khóa
  }
}

/** Sửa số buổi TAY từng buổi cho 1 học sinh — mỗi buổi có ô nhập số riêng,
 *  tự chọn số mình muốn, không bị chặn vì "trùng với buổi khác" (khác nút
 *  "✎ Đổi số buổi" cũ chỉ sửa được 1 buổi/lần và từ chối nếu số đích đã có
 *  người dùng — không đổi chéo 2 buổi cho nhau được). Chỉ đổi NHÃN SỐ, không
 *  đụng điểm/bài tập/ghi chú/điểm danh. Có nút "Gợi ý theo ngày" điền sẵn để
 *  đỡ gõ tay, và "↩️ Hoàn tác" ngay sau khi lưu nếu lỡ tay (chỉ còn tác dụng
 *  trong lúc đang mở màn hình này). */
export function ResequenceSessionsModal({ cls, studentId, update, onClose }: Props) {
  const student = cls.students.find((s) => s.id === studentId)
  const sorted = [...(student?.sessions ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no)

  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(sorted.map((s) => [s.id, String(s.no)])),
  )
  const [saving, setSaving] = useState(false)
  const [lastApplied, setLastApplied] = useState<Applied[] | null>(() => loadUndo(studentId))
  const [error, setError] = useState('')

  useEffect(() => {
    saveUndo(studentId, lastApplied)
  }, [studentId, lastApplied])

  if (!student) return null

  function suggestByDate() {
    setDrafts(Object.fromEntries(sorted.map((s, i) => [s.id, String(i + 1)])))
    setError('')
  }

  async function applyChanges(targets: { sessionId: string; newNo: number }[], successMsg: (n: number) => string) {
    setSaving(true)
    let okCount = 0
    let failCount = 0
    const applied: Applied[] = []
    for (const t of targets) {
      const ss = student!.sessions.find((s) => s.id === t.sessionId)
      if (!ss || ss.no === t.newNo) continue
      const oldNo = ss.no
      if (isMongoid(t.sessionId)) {
        try {
          await sessionService.update(t.sessionId, { lessonNo: t.newNo })
        } catch {
          failCount += 1
          continue
        }
      }
      update((cData) => {
        const stu = cData.students.find((s) => s.id === studentId)
        const s = stu?.sessions.find((s2) => s2.id === t.sessionId)
        if (s) s.no = t.newNo
      })
      applied.push({ sessionId: t.sessionId, oldNo, newNo: t.newNo })
      okCount += 1
    }
    update((cData) => {
      const stu = cData.students.find((s) => s.id === studentId)
      stu?.sessions.sort((a, b) => a.no - b.no)
    })
    setSaving(false)
    if (okCount) {
      logActivity('session.resequence', { className: cls.name, studentName: student!.name, count: okCount }, 'ClassSession')
      setLastApplied(applied)
    }
    if (failCount) toast.error(`Lưu được ${okCount} buổi, lỗi ${failCount} buổi — thử lại các buổi lỗi sau.`, { persist: true })
    else if (okCount) toast.success(successMsg(okCount))
    return okCount > 0
  }

  async function handleSave() {
    setError('')
    const targets = sorted.map((s) => ({ sessionId: s.id, newNo: Number(drafts[s.id]) }))
    if (targets.some((t) => !Number.isFinite(t.newNo) || t.newNo < 1)) {
      setError('Số buổi phải là số nguyên ≥ 1.')
      return
    }
    const seen = new Map<number, number>()
    targets.forEach((t) => seen.set(t.newNo, (seen.get(t.newNo) ?? 0) + 1))
    const dupNos = [...seen.entries()].filter(([, count]) => count > 1).map(([no]) => no)
    if (dupNos.length) {
      setError(`Số buổi ${dupNos.join(', ')} đang bị gán cho 2 buổi trở lên — mỗi buổi phải có số riêng, sửa lại trước khi lưu.`)
      return
    }
    // Không tự đóng màn hình sau khi lưu — để nút "↩️ Hoàn tác" kịp hiện ra
    // ngay, lỡ tay sửa sai còn trả lại được ngay tại chỗ.
    await applyChanges(targets, (n) => `Đã lưu ${n} buổi thay đổi cho ${student!.name}.`)
  }

  async function handleUndo() {
    if (!lastApplied) return
    const targets = lastApplied.map((a) => ({ sessionId: a.sessionId, newNo: a.oldNo }))
    await applyChanges(targets, (n) => `Đã hoàn tác, trả lại số cũ cho ${n} buổi.`)
    setLastApplied(null)
  }

  const changedCount = sorted.filter((s) => Number(drafts[s.id]) !== s.no).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: '#00000060' }}
      onClick={onClose}
    >
      <Card
        className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-base" style={{ color: C.ink }}>
            🔧 Sửa số buổi — {student.name}
          </div>
          {lastApplied && (
            <button
              onClick={handleUndo}
              disabled={saving}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold"
              style={{ background: C.gold + '22', color: '#92400E', border: `1px solid ${C.gold}` }}
            >
              ↩️ Hoàn tác lần sửa vừa rồi
            </button>
          )}
        </div>
        <div className="text-xs" style={{ color: C.muted }}>
          Tự gõ đúng số buổi mong muốn cho từng buổi — đổi chéo số cho nhau (VD Buổi 2 ↔ Buổi 3) cũng
          làm được. Chỉ đổi nhãn số, không đụng điểm/bài tập/ghi chú/điểm danh của buổi nào cả.
        </div>

        <button type="button" onClick={suggestByDate} className="text-xs font-semibold" style={{ color: C.board2 }}>
          💡 Gợi ý: điền sẵn theo thứ tự ngày học (có thể sửa lại sau khi điền)
        </button>

        <div className="space-y-1">
          {sorted.map((s) => {
            const changed = Number(drafts[s.id]) !== s.no
            return (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                style={{ border: `1px solid ${changed ? C.gold : C.line}`, background: changed ? C.gold + '0f' : C.paper }}
              >
                <span style={{ color: C.muted }}>Buổi</span>
                <input
                  type="number" min={1}
                  value={drafts[s.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  className="w-14 rounded-lg px-2 py-1 text-center font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span className="flex-1 truncate" style={{ color: C.muted }}>{viDate(s.date)}</span>
                {s.homework && (
                  <span className="max-w-[40%] truncate text-xs" style={{ color: C.muted }} title={s.homework}>
                    📝 {s.homework}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {error && <div className="text-xs font-semibold" style={{ color: C.red }}>⚠ {error}</div>}

        <div className="flex gap-2 pt-1">
          <Btn onClick={onClose}>Hủy</Btn>
          <Btn kind="gold" loading={saving} disabled={changedCount === 0} onClick={handleSave} className="flex-1">
            💾 Lưu {changedCount > 0 ? `${changedCount} buổi thay đổi` : ''}
          </Btn>
        </div>
      </Card>
    </div>
  )
}
