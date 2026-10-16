import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { C } from '@/constants/colors'
import { Card } from '@/components/atoms/Card'
import { Btn } from '@/components/atoms/Btn'
import { toast } from '@/store/toastStore'
import { STUDENT_KEYS, SESSION_KEYS, SCORE_KEYS } from '@/hooks'
import {
  studentMergeService, type MergeCandidate, type MergePlan, type RunMergeResult,
} from '@/services/studentMerge'

interface Props {
  fromClassId: string
  fromClassName: string
  studentId: string
  studentName: string
  onClose: () => void
}

const CONFIRM_PHRASE = 'CHUYEN THAT'

/** Gộp dữ liệu (buổi học/điểm/học phí đã thu) của 1 học sinh CHUYỂN LỚP
 *  sang tài khoản mới bị tạo trùng ở lớp đích — tìm học sinh đích theo tên
 *  trong toàn hệ thống, xem trước bảng gộp, gõ xác nhận rồi mới chạy thật.
 *  Xem đầy đủ lý do/thuật toán ở server/src/services/studentMergeService.ts. */
export function StudentMergeModal({ fromClassId, fromClassName, studentId, studentName, onClose }: Props) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MergeCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<MergeCandidate | null>(null)
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunMergeResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { items } = await studentMergeService.search(query.trim(), studentId)
        setResults(items)
      } catch {
        toast.error('Lỗi khi tìm học sinh — thử lại.')
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, studentId])

  function pickCandidate(c: MergeCandidate | null) {
    setSelected(c)
    setPlan(null)
    setConfirmText('')
    setResult(null)
  }

  async function doPreview() {
    if (!selected?.currentClass) return
    setPreviewing(true)
    try {
      const { plan: p } = await studentMergeService.preview({
        oldStudentId: studentId,
        newStudentId: selected._id,
        fromClassId,
        toClassId: selected.currentClass.classId,
      })
      setPlan(p)
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Lỗi khi xem trước — thử lại.', { persist: true })
    } finally {
      setPreviewing(false)
    }
  }

  async function doRun() {
    if (!selected?.currentClass) return
    setRunning(true)
    try {
      const res = await studentMergeService.run({
        oldStudentId: studentId,
        newStudentId: selected._id,
        fromClassId,
        toClassId: selected.currentClass.classId,
      })
      setResult(res)
      toast.success(`Đã gộp xong — "${selected.currentClass.className}" giờ có đủ ${res.plan.rows.length} buổi của ${studentName}.`)
      // Làm mới cache học sinh/buổi/điểm của CẢ 2 lớp — không đợi F5, và
      // tránh đúng race condition đã gặp (cache cũ hiển thị học sinh trùng).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STUDENT_KEYS.byClass(fromClassId) }),
        queryClient.invalidateQueries({ queryKey: STUDENT_KEYS.byClass(selected.currentClass.classId) }),
        queryClient.invalidateQueries({ queryKey: SESSION_KEYS.byClass(selected.currentClass.classId) }),
        queryClient.invalidateQueries({ queryKey: SCORE_KEYS.byClass(selected.currentClass.classId) }),
      ])
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Lỗi khi gộp — KHÔNG thử lại ngay, báo người phụ trách kỹ thuật kiểm tra trước.', { persist: true })
    } finally {
      setRunning(false)
    }
  }

  function downloadBackup() {
    if (!result?.backup) return
    const blob = new Blob([JSON.stringify(result.backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-truoc-gop-${studentName}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const vi = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: '#00000060' }} onClick={onClose}>
      <Card
        className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-bold text-base" style={{ color: C.ink }}>
            🔀 Chuyển dữ liệu — {studentName}
          </div>
          <button onClick={onClose} className="text-sm font-bold" style={{ color: C.muted }}>✕</button>
        </div>

        {result ? (
          <div className="space-y-2 rounded-lg p-3" style={{ background: '#ECFDF5' }}>
            <div className="text-sm font-semibold" style={{ color: '#065F46' }}>
              ✅ Đã gộp xong {result.plan.rows.length} buổi của {studentName} vào lớp "{result.plan.toClassName}".
              "{fromClassName}" vẫn còn giữ tài khoản cũ trong danh sách — vào tab Lớp học kiểm tra lớp mới ổn rồi tự xóa
              khỏi "{fromClassName}" (nút Xóa cạnh tên học sinh).
            </div>
            <button className="text-xs underline" style={{ color: C.muted }} onClick={downloadBackup}>
              ⬇ Tải về bản sao lưu dữ liệu trước khi gộp (JSON)
            </button>
            <Btn kind="ghost" size="sm" onClick={onClose}>Đóng</Btn>
          </div>
        ) : (
          <>
            <div className="text-xs" style={{ color: C.muted }}>
              Dùng khi <b>{studentName}</b> đã chuyển sang lớp khác và giáo viên lỡ thêm tên thủ công ở lớp mới,
              tạo ra 1 tài khoản trùng. Tìm đúng tài khoản mới đó bên dưới — toàn bộ buổi/điểm/học phí đã thu của{' '}
              {studentName} sẽ được gộp vào tài khoản đó, xếp lại theo đúng ngày học thật.
            </div>

            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Gõ tên học sinh cần chuyển dữ liệu đến..."
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ border: `1px solid ${C.line}` }}
            />

            {searching && <div className="text-xs" style={{ color: C.muted }}>Đang tìm...</div>}

            {!selected && results.length > 0 && (
              <div className="space-y-1">
                {results.map((c) => (
                  <button
                    key={c._id}
                    onClick={() => pickCandidate(c)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm"
                    style={{ border: `1px solid ${C.line}` }}
                  >
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs" style={{ color: c.currentClass ? C.muted : C.red }}>
                      {c.currentClass ? c.currentClass.className : 'chưa ở lớp nào'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {query.trim() && !searching && results.length === 0 && (
              <div className="text-xs" style={{ color: C.muted }}>Không tìm thấy học sinh nào khớp.</div>
            )}

            {selected && (
              <div className="space-y-2 rounded-lg p-3" style={{ background: C.paper }}>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    Chuyển dữ liệu <b>{studentName}</b> ({fromClassName}) → <b>{selected.name}</b>
                    {selected.currentClass ? ` (${selected.currentClass.className})` : ' (chưa ở lớp nào)'}
                  </div>
                  <button className="text-xs font-bold" style={{ color: C.muted }} onClick={() => pickCandidate(null)}>
                    Chọn lại
                  </button>
                </div>

                {!selected.currentClass ? (
                  <div className="text-xs font-semibold" style={{ color: C.red }}>
                    Học sinh này chưa ở lớp nào — cần có lớp đích mới gộp được. Thêm học sinh vào 1 lớp trước.
                  </div>
                ) : (
                  <Btn kind="ghost" size="sm" disabled={previewing} onClick={doPreview}>
                    {previewing ? 'Đang xem...' : '1. Xem trước (an toàn, không ghi gì)'}
                  </Btn>
                )}
              </div>
            )}

            {plan && (
              <>
                <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${C.line}` }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: C.paper }}>
                        <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Buổi mới</th>
                        <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Ngày</th>
                        <th className="py-1.5 px-2 text-left font-semibold" style={{ color: C.muted }}>Nguồn</th>
                        <th className="py-1.5 px-2 text-center font-semibold" style={{ color: C.muted }}>Đã thu?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.rows.map((r) => (
                        <tr key={r.sessionId} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td className="py-1.5 px-2 font-semibold">Buổi {r.newLessonNo}</td>
                          <td className="py-1.5 px-2">{vi(r.scheduledAt)}</td>
                          <td className="py-1.5 px-2">{r.source === 'old' ? fromClassName : selected?.currentClass?.className}</td>
                          <td className="py-1.5 px-2 text-center">{r.billed ? '✅' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {plan.notices.length > 0 && (
                  <div className="text-xs" style={{ color: C.muted }}>
                    Khoản học phí sẽ chuyển nguyên trạng thái ({plan.notices.length}):
                    {plan.notices.map((n, i) => (
                      <div key={i}>
                        "{n.periodLabel}" — {n.finalAmount.toLocaleString('vi-VN')}đ — {n.paymentStatus} — gửi {vi(n.sentAt)}
                      </div>
                    ))}
                    → {plan.billedCount}/{plan.rows.length} buổi được đánh dấu đã thu (không bị thu lại).
                  </div>
                )}

                <div className="space-y-2 rounded-lg p-3" style={{ background: '#FEF3C7' }}>
                  <div className="text-xs font-semibold" style={{ color: '#92400E' }}>
                    2. Xác nhận chạy thật — gõ đúng chữ "{CONFIRM_PHRASE}" vào ô dưới rồi bấm nút:
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={CONFIRM_PHRASE}
                      className="w-48 rounded-lg px-2 py-1.5 text-sm"
                      style={{ border: `1px solid ${C.line}` }}
                    />
                    <Btn kind="solid" size="sm" disabled={confirmText.trim() !== CONFIRM_PHRASE || running} onClick={doRun}>
                      {running ? 'Đang gộp...' : '✅ Gộp dữ liệu thật'}
                    </Btn>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
