import { useEffect, useRef, useState } from 'react'
import type { ClassData } from '@/types'
import { C } from '@/constants/colors'
import { viDate } from '@/utils/format'
import { isMongoid } from '@/utils/mongoid'
import { sortSessionsByDate, sequentialNumbering, numberingProblemOf, lessonNoFromLabel, renumberAfterRemoval } from '@/business/resequence'
import { periodPositionOf, sessionLabelOf } from '@/business/tuition'
import { appendOrphans, orphanForLocalDelete } from '@/business/sync'
import { useAppStore } from '@/store/appStore'
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

/** Ô nhập của 1 buổi: "Tháng k · Buổi m" (m trong 1..8 hoặc 1..12) — giáo viên không phải tự
 *  cộng ra số buổi thật (VD "Buổi 13"), không gõ được "Buổi 9" ở lớp 8 buổi/tháng. */
interface Draft { k: string; m: string }

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
  const sorted = sortSessionsByDate(student?.sessions ?? [])

  const perMonth = cls.perMonth
  const size = perMonth === 8 ? 8 : 12
  const offset = student?.sessionOffset ?? 0
  const draftOf = (no: number): Draft => {
    const { period, displayNo } = periodPositionOf(no, perMonth, offset)
    return { k: String(period), m: String(displayNo) }
  }
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(sorted.map((s) => [s.id, draftOf(s.no)])),
  )
  const [saving, setSaving] = useState(false)
  const [lastApplied, setLastApplied] = useState<Applied[] | null>(() => loadUndo(studentId))
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Khóa đồng bộ (không chờ vẽ lại) — 2 cú bấm liền trong cùng 1 lượt vẫn thấy `saving` cũ = false.
  const busyRef = useRef(false)

  useEffect(() => {
    saveUndo(studentId, lastApplied)
  }, [studentId, lastApplied])

  if (!student) return null

  function suggestByDate() {
    const byId = sequentialNumbering(student!.sessions)
    setDrafts(Object.fromEntries(sorted.map((s) => [s.id, draftOf(byId[s.id])])))
    setError('')
  }

  /** Áp 1 loạt đổi số buổi — phần buổi ĐÃ đồng bộ (isMongoid) gửi gộp
   *  TRONG 1 LẦN GỌI DUY NHẤT tới `/sessions/batch-renumber`, server ghi
   *  trong 1 giao dịch atomic: HOẶC đổi đủ tất cả, HOẶC không đổi gì cả nếu
   *  có lỗi giữa chừng. Không còn khả năng "đổi được nửa chừng rồi kẹt ở số
   *  tạm" — sự cố thật đã gặp (Lớp 7 và nhiều lớp khác, "Buổi 1014") khi
   *  cách cũ lưu tuần tự từng buổi 1, mỗi buổi 1 request độc lập có thể
   *  thành/bại riêng. Buổi CHƯA đồng bộ (local-only, chưa có id thật) không
   *  gửi server, chỉ đổi tại máy — không có gì để mất nếu lỗi.
   *  Đổi chéo số (VD Buổi 2 ↔ Buổi 3) cũng an toàn: server không cần "dọn
   *  chỗ tạm" nữa vì cả batch ghi trong cùng 1 giao dịch, MongoDB không ép
   *  ràng buộc duy nhất `lessonNo` giữa chừng (xem sessionRenumberService.ts). */
  async function applyChanges(targets: { sessionId: string; newNo: number }[], successMsg: (n: number) => string): Promise<boolean> {
    const changed = targets.filter((t) => student!.sessions.find((s) => s.id === t.sessionId)?.no !== t.newNo)
    if (!changed.length) return true
    if (busyRef.current) return false
    busyRef.current = true
    try { return await applyChangesLocked(changed, successMsg) } finally { busyRef.current = false }
  }

  async function applyChangesLocked(changed: { sessionId: string; newNo: number }[], successMsg: (n: number) => string): Promise<boolean> {
    const trueOldNo = Object.fromEntries(changed.map((t) => [t.sessionId, student!.sessions.find((s) => s.id === t.sessionId)!.no]))
    const synced = changed.filter((t) => isMongoid(t.sessionId))

    setSaving(true)
    if (synced.length) {
      try {
        await sessionService.batchRenumber(synced)
      } catch (err) {
        setSaving(false)
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        // Giao dịch atomic — lỗi nghĩa là CHƯA ĐỔI GÌ CẢ, không có buổi nào bị
        // kẹt nửa chừng, cứ thử lại nguyên lần nữa là an toàn.
        setError(msg ?? 'Lỗi khi lưu — CHƯA đổi gì cả (giao dịch an toàn), thử lại.')
        return false
      }
    }

    update((cData) => {
      const stu = cData.students.find((s) => s.id === studentId)
      if (!stu) return
      changed.forEach((t) => {
        const s = stu.sessions.find((s2) => s2.id === t.sessionId)
        if (s) s.no = t.newNo
      })
      stu.sessions.sort((a, b) => a.no - b.no)
    })
    setSaving(false)
    logActivity('session.resequence', { className: cls.name, studentName: student!.name, count: changed.length }, 'ClassSession')
    setLastApplied(changed.map((t) => ({ sessionId: t.sessionId, oldNo: trueOldNo[t.sessionId], newNo: t.newNo })))
    toast.success(successMsg(changed.length))
    setDrafts((d) => ({ ...d, ...Object.fromEntries(changed.map((t) => [t.sessionId, draftOf(t.newNo)])) }))
    return true
  }

  /** Số buổi thật của từng ô, hoặc lỗi của ô đầu tiên gõ sai. */
  function readDrafts(): { targets: { sessionId: string; newNo: number }[] } | { error: string } {
    const targets: { sessionId: string; newNo: number }[] = []
    for (const s of sorted) {
      const d = drafts[s.id]
      const r = lessonNoFromLabel(Number(d?.k), Number(d?.m), perMonth, offset)
      if (!r.ok) return { error: `Buổi ngày ${viDate(s.date)}: ${r.reason}.` }
      targets.push({ sessionId: s.id, newNo: r.no })
    }
    return { targets }
  }

  async function handleSave() {
    if (saving) return
    setError('')
    const read = readDrafts()
    if ('error' in read) { setError(read.error); return }
    // Quy định 10/11: mỗi em trong 1 lớp có đúng các buổi 1..n — không trùng, không để trống số,
    // không nhảy số. Kiểm tra cả dãy TRƯỚC khi gửi (server kiểm tra lại y hệt).
    const problem = numberingProblemOf(read.targets.map((t) => t.newNo), perMonth, offset)
    if (problem) {
      setError(`Chưa lưu: ${problem}. Bấm "💡 Gợi ý" để điền đúng theo ngày học, hoặc sửa lại các ô.`)
      return
    }
    // Không tự đóng màn hình sau khi lưu — để nút "↩️ Hoàn tác" kịp hiện ra
    // ngay, lỡ tay sửa sai còn trả lại được ngay tại chỗ.
    await applyChanges(read.targets, (n) => `Đã lưu ${n} buổi thay đổi cho ${student!.name}.`)
  }

  async function handleUndo() {
    if (!lastApplied || saving) return
    const targets = lastApplied.map((a) => ({ sessionId: a.sessionId, newNo: a.oldNo }))
    const ok = await applyChanges(targets, (n) => `Đã hoàn tác, trả lại số cũ cho ${n} buổi.`)
    if (ok) setLastApplied(null)
  }

  /** Xóa thẳng 1 buổi "dư"/sai hẳn ngay tại đây (không chỉ lệch số) — soft
   *  delete (xem sessionController.deleteSession), không mất hẳn, khôi phục
   *  lại được qua "🗑️ Buổi đã xóa" nếu lỡ tay. */
  async function handleDelete(ss: { id: string; no: number; date: string }) {
    if (busyRef.current) return
    const full = student!.sessions.find((s) => s.id === ss.id)
    // Buổi CHƯA lên server: trước đây xóa là MẤT HẲN (không xóa mềm, không
    // nhật ký) dù hộp xác nhận ghi "vẫn khôi phục được" — nghi là đường mất
    // các buổi 17/10 kẹt trên máy Lớp 3/4/5 (trông như buổi thừa/trùng nên bị
    // xóa). Giờ có dữ liệu thì chuyển vào kho giữ lại, admin vẫn xem được.
    const orphan = full ? orphanForLocalDelete(cls, student!, full) : null
    const label = sessionLabelOf(ss.no, perMonth, offset)
    const later = isMongoid(ss.id) ? renumberAfterRemoval(student!.sessions, ss.id).length : 0
    const shiftNote = later ? ` ${later} buổi phía sau sẽ lùi lên 1 số để không bị trống số.` : ''
    const msg = orphan
      ? `${label} (${viDate(ss.date)}) của ${student!.name} CHƯA lên server và CÓ điểm/điểm danh. Xóa sẽ chuyển buổi này vào "kho giữ lại" (admin xem được ở Sao lưu → Dữ liệu kẹt), KHÔNG khôi phục bằng "🗑️ Buổi đã xóa" được.${shiftNote} Vẫn xóa?`
      : `Xóa hẳn ${label} (${viDate(ss.date)}) của ${student!.name}?${shiftNote} Vẫn khôi phục lại được sau qua "🗑️ Buổi đã xóa".`
    if (!confirm(msg)) return
    busyRef.current = true
    setDeletingId(ss.id)
    try {
      if (isMongoid(ss.id)) await sessionService.remove(ss.id)
      if (orphan) {
        useAppStore.getState().setData((d) => { d.orphans = appendOrphans(d.orphans, [orphan]) })
        logActivity('session.deleteLocal', { className: cls.name, studentName: student!.name, sessionNo: ss.no, date: ss.date }, 'ClassSession')
      }
      // Server đã lùi số các buổi phía sau trong CÙNG giao dịch xóa — máy làm y hệt để không
      // hiện số trống cho tới lần đồng bộ sau. Buổi chỉ có trên máy: server không biết, không lùi.
      const shifts = isMongoid(ss.id) ? renumberAfterRemoval(student!.sessions, ss.id) : []
      update((cData) => {
        const stu = cData.students.find((s) => s.id === studentId)
        if (!stu) return
        stu.sessions = stu.sessions.filter((s) => s.id !== ss.id)
        for (const sh of shifts) {
          const x = stu.sessions.find((s) => s.id === sh.id)
          if (x) x.no = sh.to
        }
      })
      setDrafts((d) => {
        const next = { ...d }
        delete next[ss.id]
        for (const sh of shifts) next[sh.id] = draftOf(sh.to)
        return next
      })
      // Số buổi đã đổi sau lần sửa trước → hoàn tác cũ không còn đúng.
      setLastApplied(null)
      toast.success(`Đã xóa ${label} của ${student!.name}.`)
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Lỗi khi xóa — thử lại.', { persist: true })
    } finally {
      busyRef.current = false
      setDeletingId(null)
    }
  }

  const draftNo = (id: string) => {
    const d = drafts[id]
    const r = lessonNoFromLabel(Number(d?.k), Number(d?.m), perMonth, offset)
    return r.ok ? r.no : NaN
  }
  const changedCount = sorted.filter((s) => draftNo(s.id) !== s.no).length
  const currentProblem = numberingProblemOf(sorted.map((s) => s.no), perMonth, offset)

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
          Gõ tháng và buổi trong tháng cho từng buổi (lớp này <b>{size} buổi/tháng</b>, nên buổi trong tháng
          chỉ từ 1 tới {size}). Các buổi phải nối nhau liền mạch, không trùng, không bỏ trống. Đổi chéo
          (VD Buổi 2 ↔ Buổi 3) cũng làm được. Chỉ đổi số, không đụng điểm/bài tập/ghi chú/điểm danh.
        </div>
        {currentProblem && (
          <div data-testid="reseq-current-problem" className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: C.red + '12', color: C.red }}>
            ⚠ Số buổi hiện tại đang sai: {currentProblem}. Bấm "💡 Gợi ý" rồi Lưu để sửa.
          </div>
        )}

        <button type="button" onClick={suggestByDate} className="text-xs font-semibold" style={{ color: C.board2 }}>
          💡 Gợi ý: điền sẵn theo thứ tự ngày học (có thể sửa lại sau khi điền)
        </button>

        <div className="space-y-1">
          {sorted.map((s) => {
            const changed = draftNo(s.id) !== s.no
            const d = drafts[s.id] ?? { k: '', m: '' }
            const setField = (f: keyof Draft, v: string) => setDrafts((x) => ({ ...x, [s.id]: { ...d, [f]: v } }))
            const mBad = d.m !== '' && (Number(d.m) > size || Number(d.m) < 1)
            return (
              <div
                key={s.id}
                data-sess={s.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-3 py-1.5 text-sm"
                style={{ border: `1px solid ${changed ? C.gold : C.line}`, background: changed ? C.gold + '0f' : C.paper }}
              >
                <span style={{ color: C.muted }}>Tháng</span>
                <input
                  type="number" min={1} inputMode="numeric" aria-label="Tháng" data-field="k"
                  value={d.k}
                  onChange={(e) => setField('k', e.target.value)}
                  className="w-12 rounded-lg px-1 py-1 text-center font-bold"
                  style={{ border: `1px solid ${C.line}` }}
                />
                <span style={{ color: C.muted }}>· Buổi</span>
                <input
                  type="number" min={1} max={size} inputMode="numeric" aria-label="Buổi trong tháng" data-field="m"
                  value={d.m}
                  onChange={(e) => setField('m', e.target.value)}
                  className="w-12 rounded-lg px-1 py-1 text-center font-bold"
                  style={{ border: `1px solid ${mBad ? C.red : C.line}` }}
                />
                <span style={{ color: C.muted }}>/{size}</span>
                <span className="flex-1 truncate" style={{ color: C.muted }}>{viDate(s.date)}</span>
                {s.homework && (
                  <span className="max-w-[40%] truncate text-xs" style={{ color: C.muted }} title={s.homework}>
                    📝 {s.homework}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                  title="Xóa hẳn buổi này (VD buổi dư/ghi nhầm) — khôi phục lại được qua &quot;Buổi đã xóa&quot;"
                  className="shrink-0 text-xs font-semibold"
                  style={{ color: C.red, opacity: deletingId === s.id ? 0.5 : 1 }}
                >
                  🗑️
                </button>
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
